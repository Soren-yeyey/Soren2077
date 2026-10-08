'use strict';
/**
 * repositories/endingsRepository.js —— endings 表的数据访问层
 * Day 19 分层重构：endings 表的所有查询集中在这里；返回 camelCase 对象。
 */
const restClient = require('../db/restClient');

/* 某玩家的结局摘要，按达成时间倒序（契约 §3.2：progress 顺带返回 endings） */
async function listByPlayer(playerId) {
  const rows = await restClient.restGet('endings', {
    select: 'ending_key,achieved_at',
    player_id: 'eq.' + playerId,
    order: 'achieved_at.desc',
  });
  return (Array.isArray(rows) ? rows : []).map(function (e) {
    return { endingKey: e.ending_key, achievedAt: e.achieved_at };
  });
}

module.exports = { listByPlayer: listByPlayer };
