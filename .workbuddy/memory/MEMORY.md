# 项目长期记忆 — workbuddy

> 当日细节在 `YYYY-MM-DD.md` 日志里；本文件只留**跨天仍然有效**的约定、定稿与可复用的坑。

## 项目约定（硬规则）

- 项目根 `D:\workbuddy`；用户协作规则在 `AGENTS.md`（2026-09-16 写入）
- **清单驱动 + 单步推进**：用户每天发「今日任务清单」= 当天唯一任务范围。收到后只输出执行计划并停下等确认；此后**一次只做一个步骤**，做完报告（做了什么 / 改了哪些文件 / 怎么验证）后停下
- 用户须回「进入下一板块」才继续；这四个字只对当前步骤有效
- 人工操作（注册、点按钮、装软件、截图）不代做、不假装完成，给指引后停下
- 需拍板的事（方案 / 命名 / 风格）列选项与代价给用户选，不自己决定；生成内容须等用户明确说"做"
- 验证必须可亲眼确认（页面 / 文件 / 命令输出），不接受口头结论
- Git：授权代提交推送，但**提交前先列改动文件清单（含属哪天的任务）**；commit 格式 `Day X｜一句话说明`；**一天全部做完并核对后才提交**；禁 `git reset --hard` 与强推，撤销用 `git revert`
- 用户说「今天做完了」→ 逐条对照完成标准输出表格（完成标准 / 状态 / 证据）
- 密钥、`.env`、连接串永不进代码 / 提交

## 环境事实

- 工作区 `D:\workbuddy`（用户拍板不再改名）；Git `2.55.0.windows.4`；Node `v22.22.2` / npm `10.9.7`
- GitHub 账号 `Soren-yeyey`（已有）；git 身份 `user.name=Soren-yeyey` / `user.email=288827322+Soren-yeyey@users.noreply.github.com`（noreply，避免真实 QQ 邮箱外泄）
- 本机**没有 `gh` CLI** → 远程仓库只能用户网页手动建；首次 push 需浏览器授权一次
- 仓库 `https://github.com/Soren-yeyey/Soren2077.git`（Public），远程名 `origin`，主分支 `main`

## 作品与玩法定稿

- **作品名 `夜班 SOLITUDE`**（仓库名 `Soren2077`，两者不同名属正常）；`<title>` 与 `<h1>` 已统一
- 性质：**AIGC 场景 + 赛博朋克风格的网页互动叙事**；目标公开发布，电脑与手机都能玩（一套代码，不做两套适配）
- 玩法：街景首页 → 点店门进店 → 点地面移动 + **按 ①→②→③ 顺序**点 3 个物件（未轮到的只给旁白、不推进）→ 三幕读完 → 结束画面
- 一局 **3–6 分钟**（Day 9 用户实测 **3 分钟**，踩在下限）；素材 **每张 ≤1.0 MB / 总量 ≤5 MB**
- PRD 验收 **12 条**，Day 9 版本 **12/12 通过**（唯一没单独计时的是第 1 条"4G 下 5 秒看到开场"，按首屏 630.8 KB 推算 + 用户实机可用）
- **命名红线**：「赛博朋克 2077」「Night City」是商标，标题与界面禁用；「cyberpunk / 赛博朋克」作风格词可用
- 「本期不做」= research 13 条 + PRD 新砍 5 项；用户拍板**不做声音**
- 文档落点：`research.md` / `PRD.md` / `TECH_DESIGN.md` / `RUN.md` 全在仓库根目录；**PRD 内不出现技术名词**

## 技术定稿

- 路线：**单文件 `index.html` + 原生 JS/CSS**（DOM 绝对定位 + CSS transition），图片作素材，托管 **GitHub Pages**
- **明确没有**：后端 / 数据库 / 构建工具 / API / 环境变量 / 账号系统 / 存档（由「本期不做」推导，不是遗漏）
- 三层缩放模型（本项目最重要的结构约定）：
  - **场景层** —— 固定 16:9 的 `#stage` 内全用百分比定位；两屏 `#home`（街景）⇄ `#stage`（洗衣店）靠 `hidden` / `active` 切换
  - **文字层** —— 卡片 / 进度 / 结束画面用 `position: fixed` + 视口单位（否则手机竖屏舞台只剩 390×219，字号不可读）
  - **垫底层** `.backdrop` —— 同图模糊压暗铺满视口，把非 16:9 的留白变成氛围边框
- **视口高度一律写 `var(--vh)`**（= `dvh`），不写原生 `vh` —— iOS 微信 / Safari 的 `100vh` 比可见区域高，尺寸会偏大
- 场景图上要放热区时**不能用 `object-fit: cover` 铺满** —— 会裁切图片、百分比坐标全错
- 目录 / 命名：素材进 `images/`，文件名**英文小写 + 连字符**（Pages 跑在 Linux，大小写敏感）
- 页面**零第三方依赖**（无外部字体 / CDN），全部资源自托管
- **设计硬规则（Day 9 定，跨天有效）**：① 对比度正文 ≥4.5:1 ② 触控目标 ≥44×44px ③ 任何文字 ≥12px ④ 间距只用 4/8px 尺度 ⑤ 字号只有四档 **12 / 14 / 16 / 20**（Day 10 从 12/16/20/24 整体下调一档；大标题 `clamp` 上限 40、结束标题 36），层级靠字号 + 字重 + 颜色三者共同表达 ⑥ 可交互元素必须有 `:active` 与 `:focus-visible`，不能只靠 `:hover`
  - 扩热区用 `::after { inset: -8px }`，**绝不改元素 width**（会动到已标定的构图）
  - 基础节已有 `button, input, select, textarea { font: inherit }` —— `<button>` 默认 13.3333px，不加这条会整条绕过字号阶梯
  - 完整方法（审查脚本 / 四类修法 / 三个隐藏坑）见用户级技能 **`frontend-design-audit`**
  - **改字号档位前先全页 grep `em` 依赖** —— 基于 em 的 padding / margin 会随字号**连坐缩小**（Day 10 实测：`.btn` 的 `.85em` 若不动，高度从 51 掉到 40.6px，破 44px 触控线）

## 线上环境

- 站点 **`https://soren-yeyey.github.io/Soren2077/`**（2026-09-23 16:59 上线）
- Pages 配置**必须** `Deploy from a branch` / `main` / `/ (root)`：仓库里没有任何 `.github/workflows/`，选 GitHub Actions 会永远 404
- ⚠️ **push 完不等于线上生效**：构建延迟约 **45–60 秒**，立刻探测仍是旧内容 —— 别急着报"部署失败"

## 操作纪律（本机特有，别踩）

- ⚠️ **本机 `git rm` 会清空整个目录**（实测两次）→ 删仓库文件一律 `rm -f` + `git add -A`，删完**立刻 `ls` 验证**；误删用 `git checkout HEAD -- <目录>/` 恢复
- ⚠️ **`localhost` 解析成 IPv6 `::1`**，而 `python -m http.server` 默认只听 IPv4 → 起服务一律 **`--bind ::`**（双栈：localhost / 127.0.0.1 / 局域网 IPv4 全通）。无头 Chrome 会 Happy-Eyeballs 回退 IPv4 → **我这边全绿、用户那边全红** → **实测地址一律用 `localhost`**，不要图省事用 `127.0.0.1`
- ⚠️ **代理对 `github.com` 间歇性故障** → 失败先重试 1–2 次，再请用户换节点 / 重启代理（用户操作后通常**一次就过**）
  - **代理端口会变**（实测 52171 → 50608），`env | grep -i proxy` 现查现用，别记死值
  - **判别法**（区分"代理坏了"还是"只有 GitHub 这条路坏了"）：走代理打 `baidu.com` → 200 说明代理本体正常；`api.github.com` 若 CONNECT 拿到 `200 Established` 但随后 TLS 断，就是**节点对 GitHub 的线路坏了**
  - 报 `schannel: failed to receive handshake` 时**换 `-c http.sslBackend=openssl` 没用**（改报 `unexpected eof while reading`），别在这上面耗时间
  - 本机 `github.com` 解析到 `198.18.0.37`（代理 fake-IP 段）→ **"绕过代理直连"这条路天然不存在**，`--noproxy '*'` 必然 0.3 秒内失败
- ⚠️ **本地写不进 `refs/remotes/origin/*`** → 查远程事实用 `git ls-remote origin refs/heads/main`，别依赖 `origin/main`
- 查远程事实优先级：① `git ls-remote` ② `raw.githubusercontent.com/<user>/<repo>/main/<path>` 逐文件打状态码（不限流）③ `api.github.com`（未登录会限流，别首选）
- 核验一律**纯管道不落盘**（沙箱不允许往项目目录外写）：`curl -s URL | tr -d '\r' | md5sum`；状态码 `curl -s -o /dev/null -w '%{http_code}'`
- **比对内容一律用去 CR 后的 md5**（本地 CRLF / 仓库 LF，字节数会差"行数"个；相等或差行数都不能当结论）
- 链式检查**一律用 `;` 不用 `&&`**（grep 无匹配返回 1 会短路掉后面全部检查）；抽查关键词**直接从文件复制**，别凭记忆写

## 关键实现坑（可复用）

- **独立变换属性合成顺序 = `translate → rotate → scale → transform`**：`scale` 排在 `transform` 外层，会把 `transform: translate(-50%,-100%)` 的负号翻正 → 角色朝左走整体偏一个身宽（实测 64.7px）。**基础位移必须用独立 `translate` 属性**；镜像用独立 `scale`（不能塞 `transform`，会被 `idleFloat` 动画整个覆盖）
- **卡片里放 16:9 图时别让它成为 flex 主轴上的项**：`flex-basis: auto` 在 column 方向会绕开 `aspect-ratio` 去取图片内在高度 → 图被拉竖（实测 380×460）。用非 flex + `calc()` 限文字区高度
- **两条 opacity keyframes 不能合并**：`breathe` 自己就动 opacity，给 pending 另写 `opacity` 会被动画盖掉（必须单独 `breatheDim`）
- **透明渐变面板会吃掉底下元素的点击** → `pointer-events: none` + 内部可点元素恢复 `auto`
- 卡片高度参数联动（**改一个必须同步改另一个**）：`#card` `max(calc(var(--vh)*0.34), 296px)`、`#cardImg` 240px、`#cardText` `calc(上面 - 195px)`；`195px = 图(135)+图距(17)+padding(40)+3`；矮视口（`@media (max-height: 520px)`）藏配图 + 卡片 `0.38 * --vh`
- 逐句浮现：`REVEAL_STEP = 800`，首段等 **60ms**（刚插入 DOM 同帧加类浏览器不走 transition）；点卡片 = `revealAll()`；CSS 只给 `p.reveal` 初始隐藏（**不能写 `#cardText p { opacity:0 }`** —— 旁白与首页动静走同一渲染路径）
- 接地阴影**必须是独立元素**，不能用 `filter: drop-shadow`（它跟着元素一起升降）；`scale` 已用于镜像，透视只能用 `height: calc(26% * var(--p-scale))`
- 首屏优化：图片 `src` **点开时才写**；店内背景图用 `data-src` + 街景就绪后空闲预取（首屏 626 → 450 KB）
- 差分法验渲染前**必须冻结所有动画**（否则雨噪声淹没目标）；元素"该在哪"要**用两个独立来源交叉比对**（JS 写入值 vs `getBoundingClientRect()`）

## 提交历史

| hash | Day | 说明 |
|---|---|---|
| `d4d5f20` | 2 | 建仓库占位页 |
| `033caed` | 3 | research.md |
| `c6006b3` | 4 | PRD.md |
| `f8224b0` | 5 | TECH_DESIGN.md |
| `d82ff85` | 6 | AGENTS.md 追加三节 |
| `7fddbff` | 7 | MVP + RUN.md + 2 图 |
| `f3c7047` | 8 | 街景首页 + mock 渲染 + 统一角色 |
| `660ac70` | 9 | 走动手感 3A–3E + 三张物件图 + 三幕叙事 |
| `41dce83` | 9 | 技术文档与 PRD 的过期口径 |
| `4968c86` | 9 | 删旧立绘 + 同步 RUN / TECH |
| `c1e1bbd` | 9 | 文字挡画面三步（首页单条 / 卡片贴底 / 逐句浮现） |
| `42b1116` | 9 | 补记人工验收与终局核对 |
| `d5ff8f5` | 9 | 统一视口单位口径 + 店内大图延后加载 |
| `6ce8162` | 9 | 按设计规则修掉 7 处前端问题 |
| `3ca9585` | 9 | 补记推送核验与「修复后」截图 |

## 待议（不影响玩）

- 要不要给「点卡片立即全显」加一行极淡提示（我倾向不加）
- `PRD.md` 第 8 节「未决问题」5 条其实全已决，是否加标注
- **（Day 10 已决）横屏 844×390 面板偏高**：字号下调后 `.home-panel` 182.9 → 174.7px（仍比原始设计高 36.7px）→ 用户拍板**接受现状，不再收紧**。结论：面板高度由内边距 + 固定行数撑着，**降字号救不回来**（只降 8.2px）

## 工作日志

- 2026-09-16：把用户指定的协作规则写入 `AGENTS.md`（七节：任务边界、交互式推进、人机分工、讲清楚环节、Git 与提交、当日收尾、出问题的时候）
- 2026-09-24（用户口径 Day 9）：定下设计硬规则六条并完成一次全站审查 + 修复；顺手把视口单位与首屏体积两处问题一并修掉；产出可复用技能 `frontend-design-audit`
- 2026-09-25（用户口径 Day 10）：练"描述质量" —— 按用户一句话把字号整体下调一档（12/14/16/20）+ 3 处 `em` 固定成 px；横屏面板问题用户选**接受现状**；用户提出转向 FPS 大世界的新方向（选「先做完 Day 10，另起设计文档」）
- 每日细节见 `.workbuddy/memory/2026-09-*.md`
