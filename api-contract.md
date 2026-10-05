# api-contract.md —《夜班 SOLITUDE》前后端接口契约（占位稿）

> 标准版式 Day 15 板块③。**本文档只是契约约定，本周不实现任何业务接口。**
> 已上线的只有 `GET /api/health`（健康检查，不连数据库、无业务逻辑）。
> 后端：腾讯云 CloudBase（环境 `soren2077`）；数据库计划用 CloudBase 文档型数据库，一个集合对应一张表。

## 1. 通用约定

- 基础地址：`https://soren2077-d9gn6rr04d2c15165.service.tcloudbase.com`
- 所有业务接口走 `/api/*` 前缀，请求与响应体均为 JSON（`Content-Type: application/json`）
- 鉴权：本期**不做账号系统**。玩家身份用首次进站时生成的 `playerId`（UUID，存 localStorage）标识；这是占位方案，接入了 CloudBase 身份认证后会替换，接口形状不变
- 统一响应包：

```json
{ "ok": true,  "data": { } }
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "..." } }
```

- 错误码本期只约定三个：`BAD_REQUEST`（参数错）、`NOT_FOUND`（资源不存在）、`INTERNAL`（服务端错）

## 2. 数据表（三张）

### 2.1 players — 玩家进度表

| 字段 | 类型 | 说明 |
|---|---|---|
| playerId | string | 主键，UUID，客户端生成 |
| createdAt | string | 首次进站时间（ISO 8601） |
| lastSeenAt | string | 最近一次心跳/保存时间 |
| permissionLevel | number | 权限等级 1–4（对应大纲里的权限升级线） |
| currentScene | string | 当前场景标识，如 `street` / `shop` / `ending` |
| currentStep | number | 当前叙事步序（三幕内进度） |
| flags | object | 杂项布尔标记（黑猫喂过、枪已拾取等），键值不枚举 |
| updatedAt | string | 本行最后写入时间 |

**数据库实现（Day 16 定稿，见 `db/schema.sql`）**：`playerId` VARCHAR(36) 主键；时间字段 DATETIME（API 层序列化为 ISO 8601 字符串）；`permissionLevel` TINYINT 加 CHECK 1–4；`currentScene` VARCHAR(32)；`currentStep` INT CHECK ≥0；`flags` JSON。

### 2.2 clues — 线索解锁表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 主键，`{playerId}:{clueKey}` |
| playerId | string | 所属玩家 |
| clueKey | string | 线索标识，如 `clue_washer_clock` / `clue_owner_morse` |
| source | string | 解锁途径：`interact`（物件）/ `npc`（对话）/ `event`（事件） |
| unlockedAt | string | 解锁时间 |

**数据库实现（Day 16 定稿，见 `db/schema.sql`）**：`id` VARCHAR(101) 主键（= playerId 36 + 分隔符 + clueKey 64）；另加 UNIQUE(playerId, clueKey) 双保险（幂等上报靠它）；`source` ENUM('interact','npc','event')；外键 `playerId` → players，ON DELETE CASCADE。

### 2.3 endings — 结局记录表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 主键，`{playerId}:{endingKey}:{achievedAt}` |
| playerId | string | 所属玩家 |
| endingKey | string | 结局标识，三结局：`ending_truth` / `ending_escape` / `ending_silence`（暂定名，M5 定稿后回填） |
| runDurationSec | number | 本局用时（秒） |
| achievedAt | string | 达成时间 |

**数据库实现（Day 16 定稿，见 `db/schema.sql`）**：`id` VARCHAR(120) 主键（= playerId 36 + endingKey 32 + achievedAt 19 + 两个分隔符）；`endingKey` VARCHAR(32)（**不用 ENUM**——三个键名暂定，M5 定稿后可能增改，留弹性）；`runDurationSec` INT CHECK 0–86400；外键 `playerId` → players，ON DELETE CASCADE。

> 建表与种子脚本：`db/schema.sql`（可重复执行，先 DROP 后 CREATE）+ `db/seed.sql`（先删后插，固定 UUID + 固定时间，可复现）。表结构以这两个脚本 + 本节为准。

## 3. 接口清单（六个）

| # | 方法 | 路径 | 说明 | 状态 |
|---|---|---|---|---|
| 1 | GET | `/api/health` | 健康检查 | ✅ 已上线 |
| 2 | GET | `/api/progress` | 读取玩家进度 | ⏳ 占位 |
| 3 | POST | `/api/progress` | 写入玩家进度 | ⏳ 占位 |
| 4 | GET | `/api/clues` | 拉取已解锁线索列表 | ⏳ 占位 |
| 5 | POST | `/api/clues` | 上报解锁一条线索 | ⏳ 占位 |
| 6 | POST | `/api/endings` | 上报达成结局 | ⏳ 占位 |

> 结局的**查询**不单开接口：从 `GET /api/progress` 顺带返回该玩家 endings 摘要即可，少一次请求。

### 3.1 GET /api/health ✅

```
GET /api/health
→ 200 { "ok": true, "service": "Night shift-SOLITUDE" }
```

### 3.2 GET /api/progress ⏳

```
GET /api/progress?playerId={uuid}
→ 200 { "ok": true, "data": { ...players 行, "endings": [ {endingKey, achievedAt} ] } }
→ 200 { "ok": true, "data": null }        # 新玩家，尚无记录
```

### 3.3 POST /api/progress ⏳

```
POST /api/progress
body { "playerId": "...", "permissionLevel": 2, "currentScene": "shop", "currentStep": 5, "flags": { "fedCat": true } }
→ 200 { "ok": true, "data": { "updatedAt": "..." } }
```

客户端策略：场景切换 / 权限变化 / 结局达成时各写一次，不做心跳高频写。

### 3.4 GET /api/clues ⏳

```
GET /api/clues?playerId={uuid}
→ 200 { "ok": true, "data": [ { "clueKey": "...", "source": "...", "unlockedAt": "..." } ] }
```

### 3.5 POST /api/clues ⏳

```
POST /api/clues
body { "playerId": "...", "clueKey": "clue_washer_clock", "source": "interact" }
→ 200 { "ok": true, "data": { "unlockedAt": "..." } }
```

幂等：同一 `{playerId, clueKey}` 重复上报返回首次的 `unlockedAt`，不报错。

### 3.6 POST /api/endings ⏳

```
POST /api/endings
body { "playerId": "...", "endingKey": "ending_escape", "runDurationSec": 512 }
→ 200 { "ok": true, "data": { "achievedAt": "..." } }
```

## 4. 本期明确不做

- 账号系统 / 登录态（`playerId` 仅是本地标识）
- 排行榜、跨玩家数据
- 接口的限流、签名校验（CloudBase HTTP 触发器自带基础防护）
- **以上六个占位接口的任何服务端实现**——写完本文档即止，实现排期到后续 Day 再由用户拍板
