'use strict';
/**
 * repositories/playersRepository.js —— players 表的数据访问层（api-clues 用）
 * Day 19 分层重构：本函数用到的 players 查询集中在这里。
 */
const restClient = require('../db/restClient');

/* 玩家存在性检查（POST /api/clues 防脏数据：未知玩家 BAD_REQUEST 拒绝） */
async function exists(playerId) {
  const rows = await restClient.restGet('players', {
    select: 'player_id',
    player_id: 'eq.' + playerId,
    limit: '1',
  });
  return Array.isArray(rows) && rows.length > 0;
}

module.exports = { exists: exists };
