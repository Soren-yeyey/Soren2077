'use strict';
/**
 * repositories/cluesRepository.js —— clues 表的数据访问层
 * Day 19 分层重构：clues 表的所有查询/插入集中在这里；返回 camelCase 对象。
 * snake_case → camelCase 映射属于数据层职责，接口层不感知数据库列名。
 */
const restClient = require('../db/restClient');

/* 列表：某玩家已解锁线索，unlocked_at 升序（契约 §3.4） */
async function listByPlayer(playerId, limit) {
  const rows = await restClient.restGet('clues', {
    select: 'clue_key,source,unlocked_at',
    player_id: 'eq.' + playerId,
    order: 'unlocked_at.asc',
    limit: String(limit),
  });
  return (Array.isArray(rows) ? rows : []).map(function (r) {
    return { clueKey: r.clue_key, source: r.source, unlockedAt: r.unlocked_at };
  });
}

/* 查重：按主键 {playerId}:{clueKey} 查一行，返回 [{unlockedAt}]（空数组 = 不存在） */
async function findById(rowId) {
  const rows = await restClient.restGet('clues', {
    select: 'unlocked_at',
    id: 'eq.' + rowId,
    limit: '1',
  });
  return (Array.isArray(rows) ? rows : []).map(function (r) {
    return { unlockedAt: r.unlocked_at };
  });
}

/* 插入一条解锁记录；unlocked_at 交 DB default now()，return=representation 拿回真值 */
async function insert(rowId, playerId, clueKey, source) {
  const result = await restClient.restPost('clues', {
    id: rowId,
    player_id: playerId,
    clue_key: clueKey,
    source: source,
  });
  const row = Array.isArray(result) ? result[0] : result;
  return { unlockedAt: row.unlocked_at };
}

module.exports = { listByPlayer: listByPlayer, findById: findById, insert: insert };
