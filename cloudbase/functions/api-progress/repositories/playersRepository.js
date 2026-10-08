'use strict';
/**
 * repositories/playersRepository.js —— players 表的数据访问层
 * Day 19 分层重构：players 表的所有查询集中在这里；返回 camelCase 对象。
 * snake_case → camelCase 映射属于数据层职责，接口层不感知数据库列名。
 * undefined 归一为 null：JSON.stringify 会丢弃 undefined 字段，null 则保留键。
 * Day 22：新增 updateFields（PATCH 部分更新）——camelCase 白名单字段 → snake_case 列名
 *   映射在这里做，接口层只传业务字段名；updated_at 由本层显式带上
 *   （PostgREST 不自动维护 updated_at，schema 里只有 DEFAULT 没有触发器）。
 */
const restClient = require('../db/restClient');

const SELECT_COLS = 'player_id,created_at,last_seen_at,permission_level,current_scene,current_step,flags';

/* PATCH 白名单：camelCase（接口层）→ snake_case（DB 列） */
const FIELD_MAP = {
  lastSeenAt: 'last_seen_at',
  permissionLevel: 'permission_level',
  currentScene: 'current_scene',
  currentStep: 'current_step',
  flags: 'flags',
};

/* DB 行 → camelCase 对象（findById 与 updateFields 共用） */
function rowToPlayer(p) {
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

/* 查一个玩家，返回 camelCase 对象；不存在返回 null（契约 §3.2 新玩家 data:null） */
async function findById(playerId) {
  const rows = await restClient.restGet('players', {
    select: SELECT_COLS,
    player_id: 'eq.' + playerId,
    limit: '1',
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rowToPlayer(rows[0]);
}

/* 部分更新：patch 是「已通过接口层校验」的 camelCase 字段对象，只含要改的键。
   返回更新后的完整行（camelCase）；过滤条件没命中任何行时返回 null */
async function updateFields(playerId, patch) {
  const body = {};
  Object.keys(patch).forEach(function (k) {
    if (patch[k] !== undefined) body[FIELD_MAP[k]] = patch[k];
  });
  body.updated_at = new Date().toISOString(); // 最后写入时间由服务端维护
  const rows = await restClient.restPatch('players', {
    select: SELECT_COLS,
    player_id: 'eq.' + playerId,
  }, body);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rowToPlayer(rows[0]);
}

module.exports = { findById: findById, updateFields: updateFields, FIELD_MAP: FIELD_MAP };
