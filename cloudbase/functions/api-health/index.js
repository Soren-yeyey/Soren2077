'use strict';

/* ============================================================
 * api-health —— 夜班 SOLITUDE 第一个云函数（Day 15）
 *
 * 职责：只有一件事——证明「后端活着」。
 *   - 不连数据库
 *   - 不写业务逻辑
 *   - 不读取任何用户输入（参数一律无视）
 *
 * 两种触发方式都支持：
 *   1. HTTP 访问服务（云接入）：浏览器直接打开 /api/health
 *   2. 控制台「测试」按钮 / SDK 调用：返回对象本身
 * ============================================================ */

const OK_BODY = JSON.stringify({
  ok: true,
  service: 'Night shift-SOLITUDE',
});

exports.main = async (event) => {
  // 云接入（HTTP）触发时，event 里带 httpMethod / path 等字段；
  // 此时必须返回 { statusCode, headers, body } 形状，浏览器才能收到 JSON。
  if (event && event.httpMethod) {
    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: OK_BODY,
    };
  }

  // 控制台测试 / SDK 直接调用：原样返回对象
  return {
    ok: true,
    service: 'Night shift-SOLITUDE',
  };
};
