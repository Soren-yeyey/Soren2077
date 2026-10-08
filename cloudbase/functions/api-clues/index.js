'use strict';
/**
 * 云函数 api-clues — GET  /api/clues?playerId={uuid}&limit={1..50}（§3.4，Day 17）
 *            — POST /api/clues  body { playerId, clueKey, source }（§3.5，Day 18）
 * Day 19 分层重构：数据库操作全部移出本文件——
 *   repositories/playersRepository.js（玩家存在性检查）
 *   repositories/cluesRepository.js（列表 / 查重 / 插入）
 *   db/restClient.js（Data API 调用机制）
 * 本文件只保留「接请求、校验、调函数、返响应」，契约行为不变。
 * GET：拉取已解锁线索，unlocked_at 升序，limit 1-50；未知玩家返回空数组
 * POST：上报解锁一条线索，幂等——重复上报返回首次 unlockedAt 不报错，
 *   data.duplicated=true 标记命中已存在记录；校验失败中文报错（一次报出）；
 *   未知玩家 BAD_REQUEST 拒绝
 * OPTIONS：浏览器跨域 POST 预检应答（204 + CORS 头）
 * Day 20：CORS 从 * 通配改为白名单回显——只放行自己的静态托管域名，
 *   非白名单来源不带 Access-Control-Allow-Origin，浏览器自行拦截
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const restClient = require('./db/restClient');
const playersRepository = require('./repositories/playersRepository');
const cluesRepository = require('./repositories/cluesRepository');

/* POST 校验常量：source 枚举 + clueKey 白名单（DB 层 CHECK ≥3 字符，API 层更严防注入歧义） */
const SOURCE_VALUES = ['interact', 'npc', 'event'];
const CLUE_KEY_RE = /^[A-Za-z0-9_-]{3,64}$/;

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

/* 给响应补 CORS 头：Origin 在白名单里才带 ACAO，否则什么都不加（浏览器拒绝跨域读取）。
   实测网关（tcbgw）会在函数未带 ACAO 时自作注入本环境静态托管域名——
   与本白名单策略不冲突：函数带时响应恰一条，函数不带时注入值也只放行自家域名 */
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
  const playerExists = await playersRepository.exists(playerId);
  if (!playerExists) {
    return fail('BAD_REQUEST', '玩家不存在：playerId 未注册，请先创建玩家记录');
  }

  /* 4) 幂等查重：同 {playerId, clueKey} 已存在 → 返回首次 unlockedAt 不报错 */
  const rowId = String(playerId) + ':' + String(clueKey);
  const existing = await cluesRepository.findById(rowId);
  if (existing.length > 0) {
    console.log('[api-clues] POST duplicated playerId=' + playerId + ' clueKey=' + clueKey);
    return ok({ unlockedAt: existing[0].unlockedAt, duplicated: true });
  }

  /* 5) 插入（unlocked_at 交给 DB default now()）；并发撞 UNIQUE(409) 兜底重查 */
  try {
    const inserted = await cluesRepository.insert(rowId, String(playerId), String(clueKey), String(source));
    console.log('[api-clues] POST created playerId=' + playerId + ' clueKey=' + clueKey + ' source=' + source);
    return ok({ unlockedAt: inserted.unlockedAt, duplicated: false });
  } catch (err) {
    if (err && err.status === 409) {
      const again = await cluesRepository.findById(rowId);
      if (again.length > 0) {
        console.log('[api-clues] POST duplicated(409) playerId=' + playerId + ' clueKey=' + clueKey);
        return ok({ unlockedAt: again[0].unlockedAt, duplicated: true });
      }
    }
    throw err;
  }
}

exports.main = async (event = {}) => {
  try {
    const method = String(event.httpMethod || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      /* 浏览器跨域发 POST JSON 会先预检，必须应答 CORS 头（白名单命中才带 ACAO） */
      return withCors(event, {
        statusCode: 204,
        headers: Object.assign({}, CORS_HEADERS, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }),
        body: '',
      });
    }
    if (method === 'POST') return withCors(event, await handlePost(event));
    if (method !== 'GET') return withCors(event, fail('BAD_REQUEST', '只支持 GET 或 POST 请求'));

    const qs = event.queryStringParameters || {};
    const playerId = qs.playerId;
    if (!playerId || !UUID_RE.test(playerId)) {
      return withCors(event, fail('BAD_REQUEST', 'playerId 缺失或不是合法 UUID'));
    }

    let limit = 50; // 默认上限，契约 3.4 未定义时取 50
    if (qs.limit != null && qs.limit !== '') {
      if (!/^\d+$/.test(String(qs.limit))) return withCors(event, fail('BAD_REQUEST', 'limit 必须是正整数'));
      limit = Number(qs.limit);
      if (limit < 1 || limit > 50) return withCors(event, fail('BAD_REQUEST', 'limit 取值范围 1-50'));
    }

    const data = await cluesRepository.listByPlayer(playerId, limit);
    return withCors(event, ok(data));
  } catch (err) {
    return withCors(event, internalError('api-clues', err));
  }
};

/* —— 测试钩子（不影响线上）：转发到底座的桩注入 —— */
exports.__testOnlySetFetch = function (fn) { restClient.__setFetch(fn); };
exports.__testOnlySetApiKey = function (k) { restClient.__setApiKey(k); };
exports.__testHelpers = {
  UUID_RE: UUID_RE, CLUE_KEY_RE: CLUE_KEY_RE, SOURCE_VALUES: SOURCE_VALUES,
  ok: ok, fail: fail, handlePost: handlePost,
  CORS_ALLOWLIST: CORS_ALLOWLIST, withCors: withCors,
};
