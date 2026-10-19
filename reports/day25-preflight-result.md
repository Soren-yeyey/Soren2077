# 发布前检查报告

- 检查时间：2026-10-19 22:28:33 +08:00
- 项目目录：E:\Codex-AIGM\Soren2077
- 公网地址：https://soren-yeyey.github.io/Soren2077/
- 总体结果：**失败**
- 汇总：通过 3 / 失败 2 / 阻断 0

| 检查项 | 状态 | 结果 |
| --- | --- | --- |
| 公网可访问性 | 失败 | 1 个必需页面未返回成功状态。 |
| 本地资源引用 | 通过 | 已检查 106 条静态资源引用。 |
| 密钥泄露 | 通过 | 已检查 93 个可提交文本文件，未发现已知密钥模式。 |
| 图片预算 | 通过 | 共 30 张图片，单张与总量均在预算内。 |
| 发布素材预算 | 失败 | 发布素材总量超过预算 8.16 MB。 |

## 证据

### 公网可访问性 · 失败

1 个必需页面未返回成功状态。
- https://soren-yeyey.github.io/Soren2077/ -> HTTP 200
- https://soren-yeyey.github.io/Soren2077/studio.html -> HTTP 200
- https://soren-yeyey.github.io/Soren2077/booze.html -> HTTP 404

### 本地资源引用 · 通过

已检查 106 条静态资源引用。

### 密钥泄露 · 通过

已检查 93 个可提交文本文件，未发现已知密钥模式。

### 图片预算 · 通过

共 30 张图片，单张与总量均在预算内。
- 图片总量：2.73 MB / 5.00 MB

### 发布素材预算 · 失败

发布素材总量超过预算 8.16 MB。
- 发布素材总量：13.16 MB / 5.00 MB
- models\yuheng-preview.glb：4.34 MB
- models\yuheng-drive.glb：3.12 MB
- models\workshop.glb：1.35 MB
- models\city-kit.bin：779.7 KB
- models\booze-city-kit.glb：677.0 KB
- images\npc-boss.webp：286.3 KB
- images\city-28048496ea.webp：266.5 KB
- images\home-street.webp：243.3 KB

> 退出码：0=全部通过，1=存在失败，2=存在无法验证的阻断项。
