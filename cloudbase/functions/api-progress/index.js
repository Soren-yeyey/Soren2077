'use strict';
/**
 * 云函数 api-progress — GET /api/progress?playerId={uuid}
 *                       PATCH /api/progress?playerId={uuid}（Day 22）
 * 契约：api-contract.md §3.2（GET，Day 17 实现）、§3.3（PATCH，Day 22 实现）
 * 数据层（Day 19 分层）：
 *   repositories/playersRepository.js（查玩家 / 部分更新）
 *   repositories/endingsRepository.js（结局摘要）
 *   db/restClient.js（Data API 调用机制）
 * 本文件只保留「接请求、校验、调函数、返响应」。
 * GET 新玩家返回 data:null（契约 3.2）；PATCH 修改不存在的 id 返回中文报错（契约 3.3）
 * CORS（Day 20）：白名单回显，禁用 * 通配符
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

/* —— PATCH（Day 22，契约 §3.3）—— */

/* 可改字段白名单：键=接口字段名，值=校验规则；白名单之外的字段一律拒绝（防误写整行覆盖） */
const PATCH_RULES = {
  currentScene: { type: 'enum', values: ['street', 'shop', 'ending'] },
  currentStep: { type: 'intMin0' },
  permissionLevel: { type: 'intRange', min: 1, max: 4 },
  flags: { type: 'jsonOrNull' },
  lastSeenAt: { type: 'timeOrNull' },
};

/* 解析请求体：云函数可能把 body 放 body（字符串）或 isBase64Encoded + base64 体 */
function parseBody(event) {
  let raw = event.body;
  if (event.isBase64Encoded) {
    try { raw = Buffer.from(String(event.body || ''), 'base64').toString('utf8'); }
    catch (e) { return { err: '请求体 base64 解码失败' }; }
  }
  if (raw == null || raw === '') return { err: '请求体不能为空：需要 JSON 对象，至少带一个要修改的字段' };
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { return { err: '请求体不是合法 JSON：请检查格式（例如引号、逗号是否配对）' }; }
  if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
    return { err: '请求体必须是 JSON 对象（{...}），不接受数组或其他类型' };
  }
  return { body: parsed };
}

/* 逐字段校验，收集所有问题一次报出（与 api-clues 风格一致） */
function validatePatch(body) {
  const problems = [];
  const clean = {};
  Object.keys(body).forEach(function (k) {
    const rule = PATCH_RULES[k];
    if (!rule) {
      problems.push('不支持修改字段 ' + k + '（可修改：' + Object.keys(PATCH_RULES).join(' / ') + '）');
      return;
    }
    const v = body[k];
    if (rule.type === 'enum') {
      if (rule.values.indexOf(v) === -1) {
        problems.push(k + ' 取值必须是 ' + rule.values.join(' / ') + ' 之一，收到：' + JSON.stringify(v));
      } else { clean[k] = v; }
    } else if (rule.type === 'intMin0') {
      if (!Number.isInteger(v) || v < 0) {
        problems.push(k + ' 必须是不小于 0 的整数，收到：' + JSON.stringify(v));
      } else { clean[k] = v; }
    } else if (rule.type === 'intRange') {
      if (!Number.isInteger(v) || v < rule.min || v > rule.max) {
        problems.push(k + ' 必须是 ' + rule.min + ' 到 ' + rule.max + ' 的整数，收到：' + JSON.stringify(v));
      } else { clean[k] = v; }
    } else if (rule.type === 'jsonOrNull') {
      if (v === null || (typeof v === 'object' && !Array.isArray(v))) { clean[k] = v; }
      else { problems.push(k + ' 必须是 JSON 对象或 null，收到：' + JSON.stringify(v)); }
    } else if (rule.type === 'timeOrNull') {
      if (v === null || (typeof v === 'string' && !isNaN(Date.parse(v)))) { clean[k] = v; }
      else { problems.push(k + ' 必须是合法时间字符串或 null，收到：' + JSON.stringify(v)); }
    }
  });
  if (Object.keys(clean).length === 0 && problems.length === 0) {
    problems.push('没有提供任何可修改字段（可修改：' + Object.keys(PATCH_RULES).join(' / ') + '）');
  }
  return { problems: problems, clean: clean };
}

async function handlePatch(event) {
  const qs = event.queryStringParameters || {};
  const playerId = qs.playerId;
  if (!playerId || !UUID_RE.test(playerId)) {
    return fail('BAD_REQUEST', 'playerId 缺失或不是合法 UUID');
  }

  const parsed = parseBody(event);
  if (parsed.err) return fail('BAD_REQUEST', parsed.err);
  const check = validatePatch(parsed.body);
  if (check.problems.length > 0) {
    return fail('BAD_REQUEST', '修改未提交，共 ' + check.problems.length + ' 个问题：' + check.problems.join('；'));
  }

  const before = await playersRepository.findById(playerId);
  if (!before) {
    return fail('NOT_FOUND', '玩家不存在：playerId ' + playerId + ' 没有记录，无法修改');
  }

  const updated = await playersRepository.updateFields(playerId, check.clean);
  if (!updated) return fail('INTERNAL', '更新未生效：数据库没有返回修改后的记录');
  console.log('[api-progress] PATCH ok playerId=' + playerId + ' fields=' + Object.keys(check.clean).join(','));
  return ok(updated);
}

/* Day 23 余力加练：请求日志（时间 · 方法 · 查询参数 · 结果 · 耗时）。
   wrapper 包住原逻辑，一行业务代码不用动；只打日志，不打密钥不打 body 明文 */
function withRequestLog(name, handler) {
  return async (event = {}) => {
    const t0 = Date.now();
    const method = String((event && event.httpMethod) || 'GET').toUpperCase();
    const q = JSON.stringify((event && event.queryStringParameters) || {});
    const res = await handler(event);
    console.log('[' + name + '] ' + new Date().toISOString() + ' ' + method + ' q=' + q +
      ' → ' + res.statusCode + ' ' + (Date.now() - t0) + 'ms');
    return res;
  };
}

exports.main = withRequestLog('api-progress', async (event = {}) => {
  try {
    const method = String(event.httpMethod || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      /* 浏览器跨域发 PATCH JSON 会先预检，必须应答 CORS 头（Day 22 加 PATCH） */
      return {
        statusCode: 204,
        headers: Object.assign({}, CORS_HEADERS, {
          'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }),
        body: '',
      };
    }
    if (method === 'PATCH') return withCors(event, await handlePatch(event));
    if (method !== 'GET') return withCors(event, fail('BAD_REQUEST', '只支持 GET 或 PATCH 请求'));

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
});

/* —— 测试钩子（不影响线上）：转发到底座的桩注入 —— */
exports.__testOnlySetFetch = function (fn) { restClient.__setFetch(fn); };
exports.__testOnlySetApiKey = function (k) { restClient.__setApiKey(k); };
exports.__testHelpers = {
  UUID_RE: UUID_RE, ok: ok, fail: fail,
  CORS_ALLOWLIST: CORS_ALLOWLIST, withCors: withCors,
  PATCH_RULES: PATCH_RULES, parseBody: parseBody, validatePatch: validatePatch, handlePatch: handlePatch,
};
