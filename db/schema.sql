-- =====================================================================
-- db/schema.sql —《夜班 SOLITUDE》数据模型（Day 16 定稿）
-- 依据：仓库根 api-contract.md 第 2 节（players / clues / endings 三表）
-- 方言：MySQL 8+（utf8mb4 / InnoDB）
-- 可重复执行：先 DROP 后 CREATE（子表在前，避免外键挡路）
-- =====================================================================

SET NAMES utf8mb4;

DROP TABLE IF EXISTS endings;
DROP TABLE IF EXISTS clues;
DROP TABLE IF EXISTS players;

-- ---------------------------------------------------------------------
-- 1. players 玩家进度表（契约 2.1）
--    一行 = 一个进过站的玩家；本期无账号系统，playerId 是客户端生成的 UUID
-- ---------------------------------------------------------------------
CREATE TABLE players (
  playerId        VARCHAR(36)  NOT NULL                COMMENT '主键：客户端生成的 UUID（存 localStorage）',
  createdAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次进站时间（API 层序列化为 ISO 8601）',
  lastSeenAt      DATETIME     NULL                    COMMENT '最近一次心跳/保存时间，新玩家为 NULL',
  permissionLevel TINYINT      NOT NULL DEFAULT 1      COMMENT '权限等级 1-4，对应大纲里的权限升级线，新玩家 Lv1',
  currentScene    VARCHAR(32)  NOT NULL DEFAULT 'street' COMMENT '当前场景标识：street / shop / ending',
  currentStep     INT          NOT NULL DEFAULT 0      COMMENT '当前叙事步序（三幕内进度）',
  flags           JSON         NULL                    COMMENT '杂项布尔标记，键值不枚举，如 {"fedCat":true}',
  updatedAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '本行最后写入时间',
  PRIMARY KEY (playerId),
  CONSTRAINT chk_players_perm CHECK (permissionLevel BETWEEN 1 AND 4),
  CONSTRAINT chk_players_step CHECK (currentStep >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='玩家进度表';

-- ---------------------------------------------------------------------
-- 2. clues 线索解锁表（契约 2.2）
--    一行 = 某玩家解锁了某条线索；同一 {playerId, clueKey} 只允许一行（幂等上报靠它）
-- ---------------------------------------------------------------------
CREATE TABLE clues (
  id         VARCHAR(101) NOT NULL                  COMMENT '主键：{playerId}:{clueKey}（36+1+64）',
  playerId   VARCHAR(36)  NOT NULL                  COMMENT '所属玩家',
  clueKey    VARCHAR(64)  NOT NULL                  COMMENT '线索标识，如 clue_washer_clock / clue_owner_morse',
  source     ENUM('interact','npc','event') NOT NULL COMMENT '解锁途径：interact=物件 / npc=对话 / event=事件',
  unlockedAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '解锁时间（重复上报返回首次值）',
  PRIMARY KEY (id),
  UNIQUE KEY uq_clues_player_key (playerId, clueKey),
  CONSTRAINT fk_clues_player FOREIGN KEY (playerId)
    REFERENCES players (playerId) ON DELETE CASCADE,
  CONSTRAINT chk_clues_key CHECK (CHAR_LENGTH(clueKey) >= 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='线索解锁表';

-- ---------------------------------------------------------------------
-- 3. endings 结局记录表（契约 2.3）
--    一行 = 某玩家某局达成了某结局；允许同一玩家多次（重开一局）
-- ---------------------------------------------------------------------
CREATE TABLE endings (
  id             VARCHAR(120) NOT NULL              COMMENT '主键：{playerId}:{endingKey}:{achievedAt}',
  playerId       VARCHAR(36)  NOT NULL              COMMENT '所属玩家',
  endingKey      VARCHAR(32)  NOT NULL              COMMENT '结局标识：ending_truth / ending_escape / ending_silence（暂定名，M5 定稿后回填）',
  runDurationSec INT          NOT NULL              COMMENT '本局用时（秒），一局设计 8-10 分钟',
  achievedAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '达成时间',
  PRIMARY KEY (id),
  KEY idx_endings_player (playerId),
  CONSTRAINT fk_endings_player FOREIGN KEY (playerId)
    REFERENCES players (playerId) ON DELETE CASCADE,
  CONSTRAINT chk_endings_dur CHECK (runDurationSec BETWEEN 0 AND 86400)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='结局记录表';
