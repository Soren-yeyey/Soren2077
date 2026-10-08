# api-contract.md —《夜班 SOLITUDE》前后端接口契约（占位稿）

> 标准版式 Day 15 板块③创建，Day 17 起进入实现阶段。
> 已上线：`GET /api/health`（Day 15）、`GET /api/progress` 与 `GET /api/clues`（Day 17，读接口）、`POST /api/clues`（Day 18，写接口）；`POST /api/progress`、`POST /api/endings` 仍为占位。
> 后端：腾讯云 CloudBase（环境 `soren2077`）；数据库：**CloudBase SQL 数据库（PostgreSQL）**，云函数经官方 Data API（PostgREST）读写，服务端 API Key 走云函数环境变量 `CLOUDBASE_API_KEY`（不进代码不进仓库）。

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
>
> **Day 17 更新——线上库实为 PostgreSQL**：CloudBase 体验版环境自带的是 SQL 数据库（PostgreSQL），线上建表用等价方言版 `db/postgres/schema.sql` + `db/postgres/seed.sql`（MySQL 版保留作 Day 16 历史产物）。差异只有两点：① 字段名转 snake_case（`player_id` 等），API 层映射回本契约的 camelCase；② MySQL 的列内 COMMENT / ENUM 改为 `COMMENT ON` / `CHECK IN`，约束逻辑完全一致。数据导入用 `db/seed-export/*.jsonl` 的同源数据。

## 3. 接口清单（Day 22 起为七个）

| # | 方法 | 路径 | 说明 | 状态 |
|---|---|---|---|---|
| 1 | GET | `/api/health` | 健康检查 | ✅ 已上线 |
| 2 | GET | `/api/progress` | 读取玩家进度 | ✅ 已实现（Day 17） |
| 3 | PATCH | `/api/progress` | 修改玩家进度（部分字段） | ✅ 已实现（Day 22，原 POST 设计改为 PATCH） |
| 4 | GET | `/api/clues` | 拉取已解锁线索列表 | ✅ 已实现（Day 17） |
| 5 | POST | `/api/clues` | 上报解锁一条线索 | ✅ 已实现（Day 18） |
| 6 | POST | `/api/endings` | 上报达成结局 | ⏳ 占位 |
| 7 | DELETE | `/api/clues` | 删除一条线索记录 | ✅ 已实现（Day 22） |

> 结局的**查询**不单开接口：从 `GET /api/progress` 顺带返回该玩家 endings 摘要即可，少一次请求。

### 3.1 GET /api/health ✅

```
GET /api/health
→ 200 { "ok": true, "service": "Night shift-SOLITUDE" }
```

### 3.2 GET /api/progress ✅ 已实现（Day 17）

```
GET /api/progress?playerId={uuid}
→ 200 { "ok": true, "data": { ...players 行, "endings": [ {endingKey, achievedAt} ] } }
→ 200 { "ok": true, "data": null }        # 新玩家，尚无记录
```

实现：云函数 `api-progress`，经 Data API 查 players（`player_id=eq.{uuid}&limit=1`）+ endings（`order=achieved_at.desc`）；playerId 白名单校验 UUID 后经 URLSearchParams 构造查询，无注入面。

### 3.3 PATCH /api/progress ✅ 已实现（Day 22）

```
PATCH /api/progress?playerId={uuid}
body { "currentScene": "shop", "currentStep": 5 }   ← 只提交要改的字段
→ 200 { "ok": true, "data": { ...更新后的完整玩家行 } }
```

Day 22 实现说明：原设计的 POST 全量写入改为 PATCH 部分更新（保存进度本就是改一行的部分字段，PATCH 语义更准，也避免并发覆盖）。可改字段白名单：`currentScene`（street/shop/ending）、`currentStep`（≥0 整数）、`permissionLevel`（1–4 整数）、`flags`（JSON 对象或 null）、`lastSeenAt`（时间字符串或 null）；白名单外字段拒绝，校验问题一次报全（中文）。修改不存在的 playerId 返回 `NOT_FOUND`（GET 返回 data:null 是「新玩家」语义，PATCH 是明确写操作，两种语义分开）。`updated_at` 由服务端在更新时写入。

客户端策略：场景切换 / 权限变化 / 结局达成时各写一次，不做心跳高频写。

### 3.4 GET /api/clues ✅ 已实现（Day 17）

```
GET /api/clues?playerId={uuid}&limit={1..50}
→ 200 { "ok": true, "data": [ { "clueKey": "...", "source": "...", "unlockedAt": "..." } ] }
```

实现：云函数 `api-clues`，按 `unlocked_at` 升序；`limit` 为 Day 17 余力加练参数（默认 50，越界返回 BAD_REQUEST）；未知玩家返回空数组（契约不定义 NOT_FOUND）。

### 3.5 POST /api/clues ✅ 已实现（Day 18）

```
POST /api/clues
body { "playerId": "...", "clueKey": "clue_washer_clock", "source": "interact" }
→ 200 { "ok": true, "data": { "unlockedAt": "...", "duplicated": false } }
```

幂等：同一 `{playerId, clueKey}` 重复上报返回首次的 `unlockedAt`，不报错；响应 `data` 增补 `duplicated: true` 标记命中已存在记录（新增字段，向后兼容）。

实现：云函数 `api-clues` 同函数按 `httpMethod` 分流（GET/POST 同路径同 URL）；校验失败中文报错且所有问题一次报出——playerId 必须 UUID、clueKey 白名单 `[A-Za-z0-9_-]{3,64}`（比 DB 层 CHECK ≥3 字符更严）、source ∈ interact/npc/event；未知玩家 BAD_REQUEST 拒绝（防脏数据）；幂等靠查重 + UNIQUE(player_id, clue_key) 409 兜底双保险；OPTIONS 预检应答 CORS 头；`unlocked_at` 由数据库 default now() 生成；服务端打印 created / duplicated 日志。

CORS（Day 20）：`Access-Control-Allow-Origin` 不用 `*`，按白名单回显——仅放行本项目两个静态托管域名（CloudBase `soren2077-d9gn6rr04d2c15165-1499948517.tcloudbaseapp.com`、GitHub Pages `soren-yeyey.github.io`）与本地开发地址（localhost/127.0.0.1 的 8000 端口）；非白名单来源不带该头，浏览器自行拦截；白名单命中时响应带 `Vary: Origin`。已知环境行为：CloudBase 网关会在函数未带 ACAO 时自行注入本环境静态托管域名的 ACAO 头（函数已带时让位，不会出现重复头）。

### 3.7 DELETE /api/clues ✅ 已实现（Day 22）

```
DELETE /api/clues?playerId={uuid}&clueKey={key}
→ 200 { "ok": true, "data": { "deleted": "{playerId}:{clueKey}" } }
```

Day 22 实现说明：按 `{playerId}:{clueKey}` 精确删除一条线索记录。id 不存在返回 `NOT_FOUND`（中文说明，不静默成功——接口层先查存在性再删，删后用「影响行数」复核并发场景）；删除成功返回被删记录的 id。物理删除（软删除为余力加练，尚未实施）。前端删除入口带两段式二次确认（第一次点进入确认态，3 秒内再点才执行，超时回弹）。

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
- POST 写接口 §3.3（/api/progress）与 §3.6（/api/endings）的服务端实现——§3.5 已于 Day 18 实现，其余仍占位
