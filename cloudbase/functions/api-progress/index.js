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
 * Day 20：CORS 从 * 通配改为白名单回显——只放行自己的静态托管域名，
 *   非白名单来源不带 Access-Control-Allow-Origin，浏览器自行拦截
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const restClient = require('./db/restClient');
const playersRepository = require('./repositories/playersRepository');
const endingsRepository = require('./repositories/endingsRepository');

/* CORS 白名单（Day 20）：ACAO 头一次只能带一个 Origin，所以按请求回显单一值；
   Vary: Origin 提醒缓存按请求头区分，防止 A 站的响应被缓存后吐给 B 站 */
const CORS_ALLOWLIST = [
  'https://soren2077-d9gn6rr04d2c15165-1499948517.tcloudbaseapp.com', // CloudBase 静态托管（Day 15）
  'https://soren-yeyey.github.io',                          // GitHub Pages（同仓库双部署）
  'http://localhost:8000',                                  // 本地开发（python http.server，Day 20）
  'http://127.0.0.1:8000',
];

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
};

/* 给响应补 CORS 头：Origin 在白名单里才带 ACAO，否则什么都不加（浏览器拒绝跨域读取） */
function withCors(event, res) {
  const h = (event && event.headers) || {};
  const raw = String(h.origin || h.Origin || '').replace(/\/+$/, '');
  if (CORS_ALLOWLIST.indexOf(raw) !== -1) {
    res.headers['Access-Control-Allow-Origin'] = raw;
    res.headers['Vary'] = 'Origin';
  }
  return res;
}

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
    if (method !== 'GET') return withCors(event, fail('BAD_REQUEST', '只支持 GET 请求'));

    const qs = event.queryStringParameters || {};
    const playerId = qs.playerId;
    if (!playerId || !UUID_RE.test(playerId)) {
      return withCors(event, fail('BAD_REQUEST', 'playerId 缺失或不是合法 UUID'));
    }

    const player = await playersRepository.findById(playerId);
    if (!player) return withCors(event, ok(null)); // 新玩家：契约 3.2

    const endings = await endingsRepository.listByPlayer(playerId);
    player.endings = endings;
    return withCors(event, ok(player));
  } catch (err) {
    return withCors(event, internalError('api-progress', err));
  }
};

/* —— 测试钩子（不影响线上）：转发到底座的桩注入 —— */
exports.__testOnlySetFetch = function (fn) { restClient.__setFetch(fn); };
exports.__testOnlySetApiKey = function (k) { restClient.__setApiKey(k); };
exports.__testHelpers = { UUID_RE: UUID_RE, ok: ok, fail: fail, CORS_ALLOWLIST: CORS_ALLOWLIST, withCors: withCors };
