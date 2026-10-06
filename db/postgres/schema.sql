-- =====================================================================
-- db/postgres/schema.sql —《夜班 SOLITUDE》数据模型（PostgreSQL 方言版）
-- 依据：api-contract.md 第 2 节，与 MySQL 版 db/schema.sql 逻辑等价
-- 差异说明：字段名转 snake_case（PG 惯例），API 层映射回契约的 camelCase；
--          MySQL 的列内 COMMENT 改为 COMMENT ON 语句；ENUM 改为 CHECK IN
-- 可重复执行：先 DROP 后 CREATE（子表在前）
-- 执行入口：CloudBase 控制台 → SQL 数据库 → SQL 编辑器
-- =====================================================================

DROP TABLE IF EXISTS endings;
DROP TABLE IF EXISTS clues;
DROP TABLE IF EXISTS players;

-- 1. players 玩家进度表（契约 2.1）
CREATE TABLE players (
  player_id        VARCHAR(36)  PRIMARY KEY,                          -- 主键：客户端生成的 UUID
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),               -- 首次进站时间
  last_seen_at     TIMESTAMPTZ,                                       -- 最近一次心跳/保存时间
  permission_level SMALLINT     NOT NULL DEFAULT 1
                   CHECK (permission_level BETWEEN 1 AND 4),         -- 权限等级 1-4
  current_scene    VARCHAR(32)  NOT NULL DEFAULT 'street',            -- street / shop / ending
  current_step     INTEGER      NOT NULL DEFAULT 0
                   CHECK (current_step >= 0),                        -- 三幕内叙事步序
  flags            JSONB,                                             -- 杂项布尔标记，键值不枚举
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()                -- 本行最后写入时间
);
COMMENT ON TABLE  players            IS '玩家进度表';
COMMENT ON COLUMN players.player_id  IS '主键：客户端生成的 UUID（存 localStorage）';
COMMENT ON COLUMN players.permission_level IS '权限等级 1-4，对应权限升级线';

-- 2. clues 线索解锁表（契约 2.2）
CREATE TABLE clues (
  id          VARCHAR(101) PRIMARY KEY,                              -- {player_id}:{clue_key}
  player_id   VARCHAR(36)  NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  clue_key    VARCHAR(64)  NOT NULL CHECK (CHAR_LENGTH(clue_key) >= 3),
  source      VARCHAR(16)  NOT NULL CHECK (source IN ('interact','npc','event')),
  unlocked_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE clues IS '线索解锁表（同一玩家同一线索只允许一行，幂等上报靠唯一键）';
CREATE UNIQUE INDEX uq_clues_player_key ON clues (player_id, clue_key);

-- 3. endings 结局记录表（契约 2.3）
CREATE TABLE endings (
  id               VARCHAR(120) PRIMARY KEY,                         -- {player_id}:{ending_key}:{achieved_at}
  player_id        VARCHAR(36)  NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  ending_key       VARCHAR(32)  NOT NULL,                            -- 暂定三值，M5 定稿后回填，不用枚举留弹性
  run_duration_sec INTEGER      NOT NULL CHECK (run_duration_sec BETWEEN 0 AND 86400),
  achieved_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE endings IS '结局记录表（同玩家同结局可多行，重开一局一条）';
CREATE INDEX idx_endings_player ON endings (player_id);
