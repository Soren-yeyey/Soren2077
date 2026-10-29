# 明亮场景与第三人称操控交付

2026-10-29。本轮按用户要求继续修改本地项目：可见人物的第三人称操控、全部场景提亮、建筑层次整理，以及放宽 60 MB 限制。尚未提交或发布到 GitHub Pages。

## 打开与操作

打开 http://127.0.0.1:8767/?v=bright-third-person-2 ，点击「操控人物」。WASD 移动，Shift 加速，鼠标拖动环顾，滚轮调整镜头远近。应看到镜头前方的完整人物，移动时人物行走，旋转镜头不会移动人物。

主页和工坊均使用已有 Tripo 角色及其骨骼动画；角色与 NPC 的骨骼独立。静止姿态由原行走周期计算，加速复用行走动画，未声称新增独立跑步动画。工坊原有空格跳跃、E 交互、Q 扫描和进入室内保留。赛车仍使用原有车辆控制。

主页、赛车城和工坊均为明亮蓝白天空、日光与环境补光。主页前中后景建筑重新拉开距离，赛车原有建筑及匹配的附属招牌按 0.78 比例收紧，为道路和建筑轮廓留出空间。道路、车辆、角色碰撞和交互位置仍按原玩法计算。

如果主体模型加载失败，页面会显示资源错误并阻止进入，而不是使用盒子替代。若看到旧黑天空，请刷新上述带版本参数的本地链接；线上网址尚未更新。

## 本轮主要文件

| 板块 | 文件 | 结果 |
| --- | --- | --- |
| 第三人称 | `studio/third-person.js`、`studio/player-avatar.js`、`studio/third-person.test.cjs` | 人物和镜头位置分离、独立骨骼、转向和行走、镜头墙面退让及缩放 |
| 共用日光 | `studio/daylight.js` | 明亮天空、环境反射、冷暖补光、统一显示变换 |
| 主页 | `scene.js`、`scene.css`、`index.html`、`data/city-scenes.json` | 可控人物、主体建筑布局、明亮路面、减弱暗角与镜面干扰 |
| 赛车 | `racing.js`、`racing-world.js`、`booze.html` | 明亮赛道和天空、建筑簇间隔、三个高细节模型替换，保留车辆玩法 |
| 工坊 | `studio/app.js`、`studio/presets.js`、`studio.html` | 第三人称人物、明亮室外与室内、保留编辑及镜头模式 |
| 源资产导出 | `scripts/export-detail-heroes.py`、`models/mechanical-tower-detail.glb`、`models/portrait-tower-detail.glb`、`models/commercial-island-detail.glb` | 从 Blender 源模型副本导出约 12 万面、4K 原贴图，未改源场景 |
| 资源与验证 | `scripts/validate-assets.cjs`、`scripts/audit-scene-assets.py`、`data/assets.json`、`reports/asset-scene-audit.json`、`scripts/verify-scene-integration.cjs`、`reports/bright-third-person-tests.txt` | 取消强制 60 MB 上限，保留资源路径、贴图、哈希和加载失败检查 |

三个新 GLB 分别约 10.02、10.82、11.11 MB。运行资源清单共 91,370,242 字节，约 91.4 MB；此为清单总量，不是每个场景都同时下载全部资源。保留旧低细节资产及远景 LOD。未用统一纯色材质覆盖建筑原贴图。原资源清单的 7 项 legacy-review 状态保持不变。

## 验证证据

- 108 项代码测试全部通过，记录：`reports/bright-third-person-tests.txt`。
- 13 项真实 Chrome/WebGL 浏览器检查全部通过，正常流程脚本及网络错误为零：`E:/Codex-AIGM/scene-delivery/bright-third-person/verification.json`。
- 浏览器实测包括人物行走、镜头独立旋转与缩放、视角及位置重置、步行进入赛车传送点、加速与转向、暂停和重开、车辆重置、声音切换、返回工坊、人物跳跃及进门、重新进入赛车、390×844 布局，以及故意制造主体模型 404 的错误提示。
- 49 个资源文件校验通过；审计 `runtimeIssues` 为空。道路布局检查包含 1601 个路线采样点，高细节替换保持在原模型包围范围内。
- 本地复现：在项目目录执行 `python -m http.server 8767 --bind 127.0.0.1`，另一终端执行 `node scripts/verify-scene-integration.cjs`。代码测试可在 PowerShell 执行 `$tests = (Get-ChildItem ./*.test.cjs,studio/*.test.cjs).FullName; node --test @tests`。
- 本机 Chrome、1440×900、加载后等待 11 秒，再取两段各 3 秒的帧率采样：主页 58.6–59.4 FPS，赛车全景高画质 40.3–41.8 FPS，工坊 69.8–71.5 FPS。记录在同一截图目录的 `performance.json`。首次加载和着色器准备期间帧率更低，这不是所有设备或驾驶视角的帧率保证。

真实运行截图位于 `E:/Codex-AIGM/scene-delivery/bright-third-person/`：

- `home-player-control.png`：明亮主页与可控人物。
- `race-overview.png`、`race-driving.png`：明亮赛车城及驾驶。
- `studio-player-control.png`、`studio-interior-third-person.png`：工坊第三人称及进入室内。
- `home-mobile.png`、`race-mobile.png`：窄屏布局，未等同于完成手机触屏操控验收。

本轮改善了可见性、空间层次和模型细节，模型表面仍保留原 Tripo 生成资产的形态，未将其描述为已达到参考图的最终美术品质。
