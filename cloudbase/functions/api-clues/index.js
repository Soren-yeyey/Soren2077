'use strict';
/**
 * 云函数 api-clues — GET /api/clues?playerId={uuid}&limit={1..50}
 * 契约：api-contract.md §3.4（Day 17 实现，Day 17 改版：Data API / PostgREST）
 * limit 条数限制为 Day 17 余力加练；未知玩家返回空数组（契约未定义 NOT_FOUND）
 * 数据源：CloudBase SQL 数据库（PostgreSQL）官方 Data API
 *   https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}
 * 鉴权：服务端 API Key 走云函数环境变量 CLOUDBASE_API_KEY（不进代码不进仓库）
 * 注入安全：playerId 白名单 UUID + limit 严格整数 1-50，查询经 URLSearchParams 构造
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENV_ID = 'soren2077-d9gn6rr04d2c15165';
const REST_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

/* —— 可注入桩（本地测试用），线上用真实实现 —— */
let _fetch = (typeof fetch === 'function') ? fetch : null;
let _apiKey = null;
function apiKey() {
  if (_apiKey) return _apiKey;
  const k = process.env.CLOUDBASE_API_KEY;
  if (!k) throw new Error('CLOUDBASE_API_KEY 环境变量未配置');
  return k;
}

async function restGet(table, params) {
  const url = REST_BASE + '/' + table + '?' + new URLSearchParams(params).toString();
  const res = await _fetch(url, {
    headers: { Authorization: 'Bearer ' + apiKey(), Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(function () { return ''; });
    throw new Error('DATA_API_' + res.status + ': ' + text.slice(0, 200));
  }
  return res.json();
}

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

    let limit = 50; // 默认上限，契约 3.4 未定义时取 50
    if (qs.limit != null && qs.limit !== '') {
      if (!/^\d+$/.test(String(qs.limit))) return fail('BAD_REQUEST', 'limit 必须是正整数');
      limit = Number(qs.limit);
      if (limit < 1 || limit > 50) return fail('BAD_REQUEST', 'limit 取值范围 1-50');
    }

    const rows = await restGet('clues', {
      select: 'clue_key,source,unlocked_at',
      player_id: 'eq.' + playerId,
      order: 'unlocked_at.asc',
      limit: String(limit),
    });

    const data = (Array.isArray(rows) ? rows : []).map(function (r) {
      return { clueKey: r.clue_key, source: r.source, unlockedAt: r.unlocked_at };
    });
    return ok(data);
  } catch (err) {
    return internalError('api-clues', err);
  }
};

/* —— 测试钩子（不影响线上）：本地注入桩 fetch / 桩密钥 —— */
exports.__testOnlySetFetch = function (fn) { _fetch = fn; };
exports.__testOnlySetApiKey = function (k) { _apiKey = k; };
exports.__testHelpers = { UUID_RE: UUID_RE, ok: ok, fail: fail };
