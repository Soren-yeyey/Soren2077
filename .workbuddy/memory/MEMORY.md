# 项目长期记忆 — workbuddy

> 当日细节见 `YYYY-MM-DD.md`。只留跨天仍有效的约定、定稿与坑。

## 协作硬规则

- 清单驱动+单步推进：日清单=当天唯一范围；收到先出执行计划停下等确认；一次只做一步，做完报告（做了什么/改了哪些文件/怎么验证）再停；「进入下一板块」只对当前步骤有效
- 人工操作不代做；需拍板列选项与代价；验证必须可亲眼确认；生成内容等用户明确说「做」
- Git：提交前先列改动文件清单（含属哪天任务）；格式 `Day X｜一句话`；禁 reset --hard/强推，撤销用 revert；密钥/.env 永不进代码与提交
- 素材进 images/，英文小写+连字符；单张≤1MB 总量≤5MB；界面中文不夹英文；禁「赛博朋克2077」「Night City」商标，风格词可用
- 用户说「今天做完了」→ 对照完成标准输出表格（标准/状态/证据）

## 环境事实

- 仓库 github.com/Soren-yeyey/Soren2077（Public，main）；站点 soren-yeyey.github.io/Soren2077/；Pages 必须 Deploy from a branch / main / root；**push 后构建延迟 45–60s**
- 本机无 gh CLI；git 身份 Soren-yeyey + noreply 邮箱；Node 用托管版 `binaries/node/versions/22.22.2-6/node.exe`，全局包装在 `binaries/node/workspace/node_modules`（运行带 NODE_PATH）
- 浏览器验证：playwright-core + **Edge**（msedge.exe，Chrome 是坏 stub）；3D 验证钩子 `__poc` 含 player/scene/camera，playwright 运镜直接改 player 字段（瞬移后等 ≥1s 相机才落定）
- CloudBase：环境 `soren2077-d9gn6rr04d2c15165`（到期 2027-04-03）；新控制台「SQL 数据库」是 **PostgreSQL**，云函数走 Data API（PostgREST）+ service_role API Key（名 nightshift-server，明文不进仓库）；PG 方言脚本在 `db/postgres/`

## 作品与技术定稿

- 夜班 SOLITUDE：赛博朋克 3D 街区+第一人称；单文件 index.html + 原生 JS + `libs/three.min.js`，零 CDN
- 玩法定稿：三巨头=欧湃智能/安斯洛/深祈；权限 Lv1→4；伙伴=便利店老板（摩斯灯语，**已拍板未做**：密码 SOS/半解谜/便利店灯箱载体）；黑衣人=前员工反转；3 结局；8–10 分钟；真实公司名必须虚构化
- 文档全在仓库根（research/PRD/TECH_DESIGN/RUN/api-contract/DEPLOY）；PRD 不出现技术名词
- 美术管线（10-06 拍板）：Three.js 程序化→AI 精修→Blender→Remotion；步骤①剪影群②立面③便利店④洗衣店⑤街面道具⑥端点封闭**全部完成、均未提交**（端墙/填充楼带 name=capA/capB/capFill/capStrip 便于差分调试）
- 2D 遗产坑：三层缩放模型（.world inset -10%、文字层 fixed+视口单位、backdrop 垫底）；transform 里不叠 scale；resetPan 先 no-transition；视口一律 var(--vh)；热区不用 object-fit:cover
- 3D：走道边界 x±4.4 / z−26.5~14（tick 每帧覆写）；yaw=0 朝 −z、+π/2 朝 −x；**贴墙道具运行时选宿主楼**（硬编码必被随机楼埋）；canvas 发光贴图亮度三档（Standard 死黑→Basic；Basic 过亮 bloom 白斑→color 乘数压）
- 设计硬规则：对比度≥4.5:1；触控≥44px；文字≥12px；间距只用 4/8 尺度；字号四档 12/14/16/20；交互必有 :active+:focus-visible；扩热区 `::after inset:-8px` 不改 width；**改字号前先 grep em**（padding/margin 连坐缩小）。完整方法见用户级技能 frontend-design-audit

## 操作纪律（本机）

- ⚠️ 本机 `git rm` 会清空整个目录 → 删文件用 `rm -f` + `git add -A`，删完立刻 ls 验证
- ⚠️ localhost 解析 IPv6 → `python -m http.server --bind ::`；实测地址一律用 localhost
- ⚠️ 代理对 github 间歇故障：连试 2–3 次（常第 3 次过）再换节点；端口现查 `env|grep -i proxy`；解析到 198.18.x（fake-IP）→ 直连不存在
- ⚠️ push 挂死=credential.helper-selector 等 GUI：taskkill git 后 `git -c credential.helper= -c credential.helper=manager push origin main`（先写空再追加）
- 查远程优先级：ls-remote > raw.githubusercontent 逐文件状态码 > api.github（限流）；比对内容用**去 CR 后 md5**；链式检查用 `;` 不用 `&&`
- 差分法定位：先关嫌疑变量再调参；验渲染前冻结动画（雨噪声淹没目标）；「该在哪」用两个独立来源交叉比对

## 关键实现坑（可复用）

- 独立变换合成顺序 translate→rotate→scale→transform：scale 在外层会翻 translate 负号（整体偏一个身宽）；镜像用独立 scale
- 带display 类配 hidden 必须显式 `[hidden]{display:none}`；验证量 getBoundingClientRect，只读属性是假绿
- 双写者（定时器清理+状态机写入）→ 定时器回调必须带归属守卫
- 跨 `<script>` 块顶层 let 不互通（引用即每帧炸断 rAF、报错空消息）→ 状态挂 window.NIGHT
- 两条 opacity keyframes 不能合并；卡片 16:9 图别做 flex 主轴项；透明渐变面板 pointer-events:none；接地阴影独立元素；首屏 src 点开才写+空闲预取
- 无头 AudioContext 恒 suspended 是预期；playwright 真实 page.click 可解锁

## Day 编号（硬规则）

- 仓库旧 Day 15/16/17 提交全按 **Day 14** 算；2026-10-03（CloudBase 部署日）=标准 Day 15；编号**只以用户当天清单标注为准**，严禁自作主张顺延

## 待议（不影响玩）

- 「点卡片立即全显」要不要极淡提示（倾向不加）；PRD 第 8 节未决问题其实全已决；横屏面板偏高已拍板接受现状
