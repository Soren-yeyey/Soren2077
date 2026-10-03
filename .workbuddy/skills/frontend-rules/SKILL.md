---
name: frontend-rules
description: 审查或新写本项目页面 UI 时必用——检查对比度、触控目标、字号阶梯、间距尺度、交互反馈五项，以及 em 连坐、--vh 视口、object-fit 热区三个本项目特有坑。凡改动 index.html 或新增页面的视觉/交互代码，先加载本 Skill 再动手，改完逐项复查。
---

# 本项目前端设计硬规则（Day 9 起拍板，逐条验证过）

## 一、检查清单（逐项判定，输出 过 / 不过 + 实测数字）

| # | 规则 | 判定标准 |
|---|------|---------|
| 1 | 对比度 | 正文文字对比度 ≥ 4.5:1（大字 ≥ 3:1） |
| 2 | 触控目标 | 可点元素实际热区 ≥ 44×44px；扩热区用 `::after { inset:-8px }`，**绝不改元素 width**（会动到已标定构图） |
| 3 | 字号阶梯 | 只用 **12 / 14 / 16 / 20** 四档（Day 10 定）；大标题 `clamp` 上限 40px、结束标题 36px；任何文字 ≥ 12px |
| 4 | 间距尺度 | margin/padding/gap 只用 4 / 8px 的倍数（**判定不含 border-radius**——圆角 10px 合法，别误报） |
| 5 | 交互反馈 | 可交互元素必须有 `:active` 与 `:focus-visible`，不能只靠 `:hover` |
| 6 | 层级表达 | 层级靠 字号 + 字重 + 颜色 三者共同表达，不加第五种字号 |

## 二、本项目特有坑（新代码最容易踩的五处）

1. **em 连坐**：改字号档位前先全页 grep `em`——基于 em 的 padding/margin 会随字号**连坐缩放**。实测：`.btn` 的 `.85em` 不固定，字号降一档按钮高度 51 → 40.6px，破 44px 触控线。修法：把关键控件的 em 固定成 px。
2. **视口高度**：一律写 `var(--vh)`（= dvh），**禁止原生 `vh`**——iOS 微信/Safari 的 100vh 比可见区域高，尺寸会偏大。
3. **场景图热区**：需要在图上放百分比坐标热区时**不能用 `object-fit: cover` 铺满**——会裁切图片，坐标全错。
4. **层叠上下文困住 z-index**（Day 16 实测）：`#threeWrap` 是 `z-index:0` 的层叠上下文，**放在它里面的浮层 z-index 调到 999 也压不过剧情卡片(z20)**——子元素只在父上下文内部排序。修法：需要压过全页卡片的浮层（对话框等）挂到 `#threeWrap` 外面、`#home` 直下，再给足 z-index。判定法：z-index 改大却没效果，先查父级有没有 `z-index`/`transform`/`filter` 造出层叠上下文。
5. **setTimeout 节流打碎「定时器=过期时刻」假设**（Day 16→18 实测）：提示条 hintTip 用 `setTimeout` 到点摘 `show` 类，但 headless/手机后台把定时器节流到 ≥1s 粒度——**定时器迟到触发时，交互标签刚写上就被过期定时器摘掉类**，而状态机已登记、不再重写 → 提示条永久卡成「有字无类」。修法两件套：① 定时器回调加守卫 `if (tipEl.textContent === msg)` 只摘自己的文本；② 状态机每帧自愈：`else if (best && !tipEl.classList.contains('show'))` 原地恢复标签。推论：**任何「定时器做清理 + 状态机做写入」的双写者结构，定时器回调必须带归属守卫，状态机必须能自愈**。
6. **跨 script 块作用域**：两个 `<script>` 各自包 IIFE 时，A 块顶层 `let` 对 B 块**不可见**（不是全局）——3D 块引用 2D 块的 `inShop` 直接 ReferenceError 且**每帧炸断 tick 后半段**（错误只有空消息，极易漏诊）。修法：跨块共享状态挂 `window.XXX` 显式对象；块内私有的用本块元素状态等效判断（如 `home.classList.contains('hidden')`）。

## 三、检查方法

1. 静态：grep 扫 `font-size`（对照四档）、`margin|padding`（对照 4/8 尺度）、`vh`（应为 `var(--vh)`）、`em` 依赖。
2. 动态：优先用 **playwright-core + 系统 Chrome 写单文件验证脚本**（`npm i -g playwright-core`，`chromium.launch({ executablePath: Chrome 路径 })`）——一次跑完全部断言，没有 CLI 跨调用标签页重置/时序漂移问题；agent-browser CLI 断装时（`command not found`）不必重装也能干活。`page.click` 是真实输入，可授予 user activation（解锁 AudioContext 等手势策略）。
3. 页面内时序问题用 `setInterval` 采样状态变化（记录「时刻+类+文本」），不要靠 eval 之间的 wait 推断。
4. 每项记录：规则 / 实测值 / 过·不过，写入当日 `.workbuddy/memory/YYYY-MM-DD.md` 留档。

## 四、已知背景（为什么有这些规则）

- `<button>` 默认字号 13.3333px——基础样式已有 `button, input, select, textarea { font: inherit }`，别删，否则整条绕过字号阶梯。
- 矮视口（`@media (max-height:520px)`）藏配图、卡片高度改 `0.38 * --vh`，改动卡片时同步检查这两处。
