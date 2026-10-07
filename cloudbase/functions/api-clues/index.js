'use strict';
/**
 * 云函数 api-clues — GET  /api/clues?playerId={uuid}&limit={1..50}（§3.4，Day 17）
 *            — POST /api/clues  body { playerId, clueKey, source }（§3.5，Day 18）
 * 契约：api-contract.md §3.4 / §3.5；Data API（PostgREST）读写 CloudBase SQL（PostgreSQL）
 * GET：拉取已解锁线索，unlocked_at 升序，limit 1-50（Day 17 余力加练）；
 *      未知玩家返回空数组（契约未定义 NOT_FOUND）
 * POST：上报解锁一条线索，幂等——同一 {playerId, clueKey} 重复上报返回首次
 *      unlockedAt 不报错，data.duplicated=true 标记命中已存在记录；
 *      校验失败中文报错（所有问题一次报出）；未知玩家 BAD_REQUEST 拒绝
 * OPTIONS：浏览器跨域 POST 预检应答（204 + CORS 头）
 * 数据源：CloudBase SQL 数据库（PostgreSQL）官方 Data API
 *   https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}
 * 鉴权：服务端 API Key 走云函数环境变量 CLOUDBASE_API_KEY（不进代码不进仓库）
 * 注入安全：playerId 白名单 UUID + limit 严格整数 1-50 + clueKey 白名单字符集，
 *   查询经 URLSearchParams 构造
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

async function restPost(table, body) {
  const url = REST_BASE + '/' + table;
  const res = await _fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(function () { return ''; });
    const err = new Error('DATA_API_' + res.status + ': ' + text.slice(0, 200));
    err.status = res.status; // 供 409 UNIQUE 冲突兜底判断
    throw err;
  }
  return res.json();
}

/* POST 校验常量：source 枚举 + clueKey 白名单（DB 层 CHECK ≥3 字符，API 层更严防注入歧义） */
const SOURCE_VALUES = ['interact', 'npc', 'event'];
const CLUE_KEY_RE = /^[A-Za-z0-9_-]{3,64}$/;

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

async function handlePost(event) {
  /* 1) 解析 JSON body：HTTP 触发器给字符串，兼容 base64 与已解析对象 */
  let raw = event.body;
  if (event.isBase64Encoded && typeof raw === 'string') {
    raw = Buffer.from(raw, 'base64').toString('utf8');
  }
  let body = raw;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return fail('BAD_REQUEST', '请求体不是合法 JSON');
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('BAD_REQUEST', '请求体必须是 JSON 对象');
  }

  /* 2) 字段校验：收集所有问题一次报出（错误信息中文写清缺了什么） */
  const problems = [];
  const playerId = body.playerId;
  if (playerId == null || playerId === '') {
    problems.push('缺少必填字段 playerId');
  } else if (!UUID_RE.test(String(playerId))) {
    problems.push('playerId 不是合法 UUID');
  }

  const clueKey = body.clueKey;
  if (clueKey == null || clueKey === '') {
    problems.push('缺少必填字段 clueKey');
  } else if (!CLUE_KEY_RE.test(String(clueKey))) {
    problems.push('clueKey 只能由 3-64 个字母、数字、下划线或连字符组成');
  }

  const source = body.source;
  if (source == null || source === '') {
    problems.push('缺少必填字段 source');
  } else if (SOURCE_VALUES.indexOf(String(source)) === -1) {
    problems.push('source 只能是 interact / npc / event 之一');
  }
  if (problems.length > 0) return fail('BAD_REQUEST', problems.join('；'));

  /* 3) 未知玩家拒绝（POST /api/progress 未上线前无注册入口，防脏数据） */
  const players = await restGet('players', {
    select: 'player_id',
    player_id: 'eq.' + playerId,
    limit: '1',
  });
  if (!Array.isArray(players) || players.length === 0) {
    return fail('BAD_REQUEST', '玩家不存在：playerId 未注册，请先创建玩家记录');
  }

  /* 4) 幂等查重：同 {playerId, clueKey} 已存在 → 返回首次 unlockedAt 不报错 */
  const rowId = String(playerId) + ':' + String(clueKey);
  const existing = await restGet('clues', {
    select: 'unlocked_at',
    id: 'eq.' + rowId,
    limit: '1',
  });
  if (Array.isArray(existing) && existing.length > 0) {
    console.log('[api-clues] POST duplicated playerId=' + playerId + ' clueKey=' + clueKey);
    return ok({ unlockedAt: existing[0].unlocked_at, duplicated: true });
  }

  /* 5) 插入（unlocked_at 交给 DB default now()）；并发撞 UNIQUE(409) 兜底重查 */
  try {
    const inserted = await restPost('clues', {
      id: rowId,
      player_id: String(playerId),
      clue_key: String(clueKey),
      source: String(source),
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    console.log('[api-clues] POST created playerId=' + playerId + ' clueKey=' + clueKey + ' source=' + source);
    return ok({ unlockedAt: row.unlocked_at, duplicated: false });
  } catch (err) {
    if (err && err.status === 409) {
      const again = await restGet('clues', {
        select: 'unlocked_at',
        id: 'eq.' + rowId,
        limit: '1',
      });
      if (Array.isArray(again) && again.length > 0) {
        console.log('[api-clues] POST duplicated(409) playerId=' + playerId + ' clueKey=' + clueKey);
        return ok({ unlockedAt: again[0].unlocked_at, duplicated: true });
      }
    }
    throw err;
  }
}

exports.main = async (event = {}) => {
  try {
    const method = String(event.httpMethod || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      /* 浏览器跨域发 POST JSON 会先预检，必须应答 CORS 头 */
      return {
        statusCode: 204,
        headers: Object.assign({}, CORS_HEADERS, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }),
        body: '',
      };
    }
    if (method === 'POST') return await handlePost(event);
    if (method !== 'GET') return fail('BAD_REQUEST', '只支持 GET 或 POST 请求');

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
exports.__testHelpers = {
  UUID_RE: UUID_RE, CLUE_KEY_RE: CLUE_KEY_RE, SOURCE_VALUES: SOURCE_VALUES,
  ok: ok, fail: fail, handlePost: handlePost,
};
