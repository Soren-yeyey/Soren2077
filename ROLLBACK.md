# 回滚手册（ROLLBACK）

> 适用版本：v1.0（`4c1f65a`）｜最后一次演练：2026-10-19（Day 26）
> 原则：**先止血，再定位**。回滚不是失败，是让线上先恢复可用；定位和修复在回滚之后做。

> **适用范围说明（2026-10-19 主线切换）**：项目主线已切换为「雨幕之城」，洗衣店版 v1.0 完整归档在分支 `backup/laundry-v1.0`（提交 `81b6acf`）。下方「一、可回退版本表」中的 md5 指纹属于洗衣店版；雨幕之城的版本指纹在下次发布时补记。**回退/恢复流程、耗时数据、云函数与数据恢复、判断表、踩坑记录对两条线通用。**

---

## 一、可回退版本表

每次发布前把当前版本记到这张表顶部。回退时按「回退目标」的提交执行 `git revert`，再用**版本指纹（index.html 去 CR 后的 md5）**核对是否真的退回去了。

| 版本 | 提交 | index.html md5（去 CR） | 说明 |
|---|---|---|---|
| **v1.0（当前）** | `4c1f65a` | `8ccfbc45266885acd1c7c68f6a1505af` | 正式发布版：toast 归属守卫 + 检查台互斥锁 |
| v0.9 | `5c55fbc` | `fbd48925d87f…` | Day 23：安全审计通过版（无 toast 修复） |
| v0.8 | `6065ed1` | `8a13424fbbc2…` | Day 22：PATCH/DELETE 上线 |
| v0.7 | `dafd786` | `74de8ec3ce24…` | Day 21：第 3 周验收版 |

查任一提交的版本指纹：

```bash
git show <提交>:index.html | tr -d '\r' | md5sum
```

---

## 二、静态托管回退（已实测，2026-10-19）

### 前置检查（30 秒，别跳过）

```bash
# 1) CLI 登录态（凭据约 10 天过期，过期会要求设备授权，见「五、踩过的坑」）
tcb env list -e soren2077-d9gn6rr04d2c15165

# 2) 工作区干净、远端与本地一致
git status --short && git log --oneline -1
```

### 回退步骤

```bash
# 1) 撤销目标提交（生成一条 Revert 提交，保留历史，不 reset）
git revert --no-edit <要撤销的提交>

# 2) 核对本地已退回（和版本指纹表比对）
tr -d '\r' < index.html | md5sum

# 3) 部署到静态托管
tcb hosting deploy index.html index.html -e soren2077-d9gn6rr04d2c15165

# 4) 核对公网（注意：不要带 ?t= 随机查询串，会返回空内容）
curl -s -H "Cache-Control: no-cache" \
  https://soren2077-d9gn6rr04d2c15165-1499948517.tcloudbaseapp.com/index.html \
  | tr -d '\r' | md5sum
```

### 恢复步骤（确认新版可用后）

```bash
git revert --no-edit <刚才的 Revert 提交>     # 把回退再回退，回到原版本
tcb hosting deploy index.html index.html -e soren2077-d9gn6rr04d2c15165
curl -s -H "Cache-Control: no-cache" https://soren2077-d9gn6rr04d2c15165-1499948517.tcloudbaseapp.com/index.html | tr -d '\r' | md5sum
curl -s https://soren2077-d9gn6rr04d2c15165.service.tcloudbase.com/api/health
```

### 实测耗时（v1.0 ↔ v0.9 往返）

| 方向 | revert 提交 | 部署 | 公网校验 | 合计 |
|---|---|---|---|---|
| 回退到 v0.9 | 1.8 s | 7 s | ~4 s | **≈13 s** |
| 恢复到 v1.0 | 1.3 s | 6 s | ~4 s | **≈11 s** |

**结论：静态托管回退本身 15 秒内能完成。真正的变数是 CLI 登录态**——本次演练因凭据过期多花了约 1 分钟人工授权，墙钟被拉到约 15 分钟。所以出事时第一件事是 `tcb env list` 探一下，别等部署时才发现要扫码。

---

## 三、云函数回退（备查，本次不实操）

云函数独立打包部署，**回退要按目录整体取出旧版本**（`index.js` 依赖同目录的 `db/`、`repositories/`，只回退 index.js 会缺文件）。

```bash
# 1) 把旧版本函数目录整体导到临时目录
mkdir -p /tmp/rb-fn/api-clues
git archive <目标提交> cloudbase/functions/api-clues | tar -x -C /tmp/rb-fn

# 2) 部署（在函数目录内，确保带上 db/ 与 repositories/）
tcb fn deploy api-clues -e soren2077-d9gn6rr04d2c15165 --force

# 3) 验证：health 与一个读接口
curl -s https://soren2077-d9gn6rr04d2c15165.service.tcloudbase.com/api/health
curl -s "https://soren2077-d9gn6rr04d2c15165.service.tcloudbase.com/api/clues?playerId=<玩家ID>"
```

注意：`api-progress` 与 `api-clues` 两个函数都要一起回退到**同一提交**，否则前后端契约可能错位。

---

## 四、数据恢复（备查，本次不实操）

**现状**：数据库没有自动快照，DELETE 是物理删除，删掉就没了。所以数据恢复只能靠「事前导出」。

- **备份**：动数据前先导出相关表（players / clues / endings）为 JSON 或 SQL，存到仓库外。
- **恢复**：先按 `db/postgres/` 的建表脚本确认结构，再把导出的数据回灌；`clues` 主键是 `{playerId}:{clueKey}`，回灌用 upsert。
- **红线**：恢复数据前先停写（前端只读或下线检查台），否则边灌边写会对不上。

---

## 五、什么情况必须回滚（判断表）

| 情况 | 判定 | 动作 |
|---|---|---|
| 首页打不开 / 白屏 / JS 报错导致玩不下去 | **必须回滚** | 立刻回退，再定位 |
| 核心流程断（写入、删除、读取任一不通）且 5 分钟内找不到原因 | **必须回滚** | 先恢复可用，修复另开提交 |
| 数据被写坏或误删（且无备份可即时恢复） | **必须回滚 + 停写** | 回退版本并关闭写入入口，防止继续污染 |
| 只有某一个次要按钮异常，主流程正常 | **观察 / 热修** | 不回滚，直接修（回滚会丢掉其他修复） |
| 只是样式错位、文案错字 | **不回滚** | 下个提交修 |
| 新版本让性能明显变差但功能正常 | **看影响面** | 影响留存就回滚，否则排期优化 |
| 刚发布的版本有问题，但回退目标版本也有同样的坑 | **不能盲退** | 退到更早的稳定版，或直接热修 |

**一句话判据**：玩家还能不能把这一夜玩完？不能 → 回滚；能 → 修。

---

## 六、踩过的坑（实测记录）

1. **`?t=` 随机查询串会让 CDN 返回空内容**：校验公网版本时不要加查询串做缓存击穿，用 `Cache-Control: no-cache` 头即可。
2. **CLI 临时凭据约 10 天过期**：`auth.json` 里的 `tmpExpired` 到期后所有命令要求设备授权。授权方式：`tcb login --flow device -e <环境ID>`，按提示在浏览器确认设备码（约 1 分钟）。
3. **`tcb hosting deploy` 只传指定文件**：只部署 `index.html` 时不会带上 `images/`、`libs/`——素材有变动要单独部署或整目录部署。
4. **CDN 刷新有延迟**：部署返回成功不代表公网立刻是新版，等 2–5 秒再校验；仍不对就等几分钟。
5. **双通道**：GitHub Pages（`soren-yeyey.github.io/Soren2077/`）也会跟随 main 构建，回退提交推送后它会在 45–60 秒后同步变成旧版——两个地址都要确认。
6. **revert 不是 reset**：回退用 `git revert` 生成反向提交，历史保留、可再 revert 回来；禁止 `reset --hard` 和强推。
