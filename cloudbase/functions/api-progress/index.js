'use strict';
/**
 * 云函数 api-progress — GET /api/progress?playerId={uuid}
 * 契约：api-contract.md §3.2（Day 17 实现，Day 17 改版：Data API / PostgREST）
 * 读 players 一行 + endings 结局摘要；新玩家返回 data:null
 * 数据源：CloudBase SQL 数据库（PostgreSQL）官方 Data API
 *   https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}
 * 鉴权：服务端 API Key 走云函数环境变量 CLOUDBASE_API_KEY（不进代码不进仓库）
 * 注入安全（「SQL 参数化」的等价物）：所有查询条件由白名单校验后的值经
 *   URLSearchParams 构造（playerId 必须 36 位 UUID），不拼任何裸字符串
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

    const players = await restGet('players', {
      select: 'player_id,created_at,last_seen_at,permission_level,current_scene,current_step,flags',
      player_id: 'eq.' + playerId,
      limit: '1',
    });
    if (!Array.isArray(players) || players.length === 0) return ok(null); // 新玩家：契约 3.2

    const p = players[0];
    const endings = await restGet('endings', {
      select: 'ending_key,achieved_at',
      player_id: 'eq.' + playerId,
      order: 'achieved_at.desc',
    });

    const data = {
      playerId: p.player_id,
      createdAt: p.created_at == null ? null : p.created_at,
      lastSeenAt: p.last_seen_at == null ? null : p.last_seen_at,
      permissionLevel: p.permission_level,
      currentScene: p.current_scene,
      currentStep: p.current_step,
      flags: p.flags == null ? null : p.flags,
      endings: (Array.isArray(endings) ? endings : []).map(function (e) {
        return { endingKey: e.ending_key, achievedAt: e.achieved_at };
      }),
    };
    return ok(data);
  } catch (err) {
    return internalError('api-progress', err);
  }
};

/* —— 测试钩子（不影响线上）：本地注入桩 fetch / 桩密钥 —— */
exports.__testOnlySetFetch = function (fn) { _fetch = fn; };
exports.__testOnlySetApiKey = function (k) { _apiKey = k; };
exports.__testHelpers = { UUID_RE: UUID_RE, ok: ok, fail: fail };
