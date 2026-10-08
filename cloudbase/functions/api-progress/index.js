'use strict';
/**
 * 云函数 api-progress — GET /api/progress?playerId={uuid}
 * 契约：api-contract.md §3.2（Day 17 实现；Day 19 分层重构）
 * Day 19 分层重构：数据库操作全部移出本文件——
 *   repositories/playersRepository.js（查玩家一行）
 *   repositories/endingsRepository.js（结局摘要）
 *   db/restClient.js（Data API 调用机制）
 * 本文件只保留「接请求、校验、调函数、返响应」，契约行为不变。
 * 新玩家返回 data:null（契约 3.2）
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const restClient = require('./db/restClient');
const playersRepository = require('./repositories/playersRepository');
const endingsRepository = require('./repositories/endingsRepository');

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
};

function json(statusCode, payload) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(payload) };
}
const ok = (data) => json(200, { ok: true, data });
const fail = (code, message) => json(200, { ok: false, error: { code, message } });

function internalError(scope, err) {
  console.error('[' + scope + '] internal error:', (err && err.message) || err);
  return fail('INTERNAL', '服务端内部错误');
}

exports.main = async (event = {}) => {
  try {
    const method = String(event.httpMethod || 'GET').toUpperCase();
    if (method !== 'GET') return fail('BAD_REQUEST', '只支持 GET 请求');

    const qs = event.queryStringParameters || {};
    const playerId = qs.playerId;
    if (!playerId || !UUID_RE.test(playerId)) {
      return fail('BAD_REQUEST', 'playerId 缺失或不是合法 UUID');
    }

    const player = await playersRepository.findById(playerId);
    if (!player) return ok(null); // 新玩家：契约 3.2

    const endings = await endingsRepository.listByPlayer(playerId);
    player.endings = endings;
    return ok(player);
  } catch (err) {
    return internalError('api-progress', err);
  }
};

/* —— 测试钩子（不影响线上）：转发到底座的桩注入 —— */
exports.__testOnlySetFetch = function (fn) { restClient.__setFetch(fn); };
exports.__testOnlySetApiKey = function (k) { restClient.__setApiKey(k); };
exports.__testHelpers = { UUID_RE: UUID_RE, ok: ok, fail: fail };
