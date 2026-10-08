'use strict';
/**
 * db/restClient.js —— Data API（PostgREST）调用底座
 * Day 19 分层重构：所有对 CloudBase SQL（PostgreSQL）的 HTTP 查询机制集中于此——
 * URL 拼接、鉴权头、错误包装、本地测试桩注入。
 * repository 文件只管「查哪张表、什么条件」，不关心传输细节。
 * 鉴权：服务端 API Key 走云函数环境变量 CLOUDBASE_API_KEY（不进代码不进仓库）
 */
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

/* Day 22：PATCH 部分更新——body 必须是 snake_case 字段对象（映射是 repository 的职责）；
   Prefer: return=representation 让 PostgREST 把更新后的行吐回来（拿真值，不自己猜） */
async function restPatch(table, filter, body) {
  const url = REST_BASE + '/' + table + '?' + new URLSearchParams(filter).toString();
  const res = await _fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + apiKey(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(function () { return ''; });
    throw new Error('DATA_API_' + res.status + ': ' + text.slice(0, 200));
  }
  return res.json();
}

module.exports = {
  restGet: restGet,
  restPatch: restPatch,
  __setFetch: function (fn) { _fetch = fn; },
  __setApiKey: function (k) { _apiKey = k; },
};
