'use strict';
/**
 * repositories/playersRepository.js —— players 表的数据访问层
 * Day 19 分层重构：players 表的所有查询集中在这里；返回 camelCase 对象。
 * snake_case → camelCase 映射属于数据层职责，接口层不感知数据库列名。
 * undefined 归一为 null：JSON.stringify 会丢弃 undefined 字段，null 则保留键。
 */
const restClient = require('../db/restClient');

/* 查一个玩家，返回 camelCase 对象；不存在返回 null（契约 §3.2 新玩家 data:null） */
async function findById(playerId) {
  const rows = await restClient.restGet('players', {
    select: 'player_id,created_at,last_seen_at,permission_level,current_scene,current_step,flags',
    player_id: 'eq.' + playerId,
    limit: '1',
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const p = rows[0];
  return {
    playerId: p.player_id,
    createdAt: p.created_at == null ? null : p.created_at,
    lastSeenAt: p.last_seen_at == null ? null : p.last_seen_at,
    permissionLevel: p.permission_level,
    currentScene: p.current_scene,
    currentStep: p.current_step,
    flags: p.flags == null ? null : p.flags,
  };
}

module.exports = { findById: findById };
