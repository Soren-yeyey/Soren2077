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

## 二、本项目特有坑（新代码最容易踩的四处）

1. **em 连坐**：改字号档位前先全页 grep `em`——基于 em 的 padding/margin 会随字号**连坐缩放**。实测：`.btn` 的 `.85em` 不固定，字号降一档按钮高度 51 → 40.6px，破 44px 触控线。修法：把关键控件的 em 固定成 px。
2. **视口高度**：一律写 `var(--vh)`（= dvh），**禁止原生 `vh`**——iOS 微信/Safari 的 100vh 比可见区域高，尺寸会偏大。
3. **场景图热区**：需要在图上放百分比坐标热区时**不能用 `object-fit: cover` 铺满**——会裁切图片，坐标全错。
4. **层叠上下文困住 z-index**（Day 16 实测）：`#threeWrap` 是 `z-index:0` 的层叠上下文，**放在它里面的浮层 z-index 调到 999 也压不过剧情卡片(z20)**——子元素只在父上下文内部排序。修法：需要压过全页卡片的浮层（对话框等）挂到 `#threeWrap` 外面、`#home` 直下，再给足 z-index。判定法：z-index 改大却没效果，先查父级有没有 `z-index`/`transform`/`filter` 造出层叠上下文。

## 三、检查方法

1. 静态：grep 扫 `font-size`（对照四档）、`margin|padding`（对照 4/8 尺度）、`vh`（应为 `var(--vh)`）、`em` 依赖。
2. 动态：无头浏览器（agent-browser）打开页面，`eval` + `getBoundingClientRect()` 量触控热区与实际渲染字号；`set viewport 390 844` 后等 1s 再量。
3. 每项记录：规则 / 实测值 / 过·不过，写入当日 `.workbuddy/memory/YYYY-MM-DD.md` 留档。

## 四、已知背景（为什么有这些规则）

- `<button>` 默认字号 13.3333px——基础样式已有 `button, input, select, textarea { font: inherit }`，别删，否则整条绕过字号阶梯。
- 矮视口（`@media (max-height:520px)`）藏配图、卡片高度改 `0.38 * --vh`，改动卡片时同步检查这两处。
