# Soren2077 · 真实资产整合与视觉重构

日期：2026-10-29。交付位置：`E:/Codex-AIGM/Soren2077`。这是可运行的本地候选版本，未提交、推送或发布。没有新生成 Tripo 模型，没有消耗生成额度，没有改写原 Blender 工程。

主页以 10 处已有 Tripo 资产形成近景、中景与上空结构，替换原先占据主体的重复简化街墙。赛车城保留原有 42 个建筑/浮岛实例，提升其中两种显示原型的细节，并增加 5 处主要建筑和 16 处分层建筑。现有驾驶路线、委托、改造、资源库、角色和声音逻辑继续使用。

主体接入与运行链路已经验证。**与参考图 3 的完整城市空间、街市密度和逐栋外观还原仍是部分完成**：现有资产以悬浮工业城市为主，并非参考图中完整的街市套件。不能把本轮运行截图称为参考图的精确复刻。

## 1. 参考图与项目审计

按本次任务书的分组使用三张实际附件，没有从搜索缩略图或概念描述臆造建筑。

| 参考 | 实际可见信息 | 本轮实施 |
|---|---|---|
| 图 1，`01-sky-circuit-overview.png` | 深色机械巨构、悬浮板块、多层道路、青蓝与品红灯光、纵深 | 主页上空与中景资产组合、冷暖关系、层次 |
| 图 2，手机截图 | 居中的品红巨环、两侧高楼、青色远景、湿地反射 | 主页主视轴、巨环、立面与地面关系 |
| 图 3，横幅街景 | 左侧高架湿街、右侧城市落差、中央高塔及横向环、蓝光与暖色店面 | 赛车城夜景、中央塔、近中远分层，保留连续可驾驶路线 |

图 3 没有给出完整闭合赛道。本轮没有把图片以外的道路走向说成参考内容，继续使用已有约 3.34 公里赛道。

工程是本地 Three.js/GLTFLoader 脚本组成的静态网页；没有 npm 构建步骤，没有引入大型依赖。入口是 `index.html`、`booze.html`、`studio.html`。`start-local.ps1` 可启动 Python 静态服务器。线上地址仍为用户原站，本轮没有部署。

首次审计扫描到 88 个 GLB、8 个 GLTF、48 个 Blender 工程。压缩前另存 6 个原始 GLB 后，最终扫描数为 94/8/48；新增的 6 个是备份，不能算作新资产。网页运行目录有 17 个模型文件。完整路径、字节数、局部网格边界、面数、图片尺寸、UV/材质通道与问题清单见 `asset-scene-audit.json`。局部边界不是摆放后的米制尺寸；摆放高度在 `data/city-scenes.json` 中。

当前连接的 Blender 文件为 `city-studio/assets/racing-world/racing-world-final.blend`，有 6089 个对象和 141 张图片；本次读取未发现未打包且路径丢失的图片。原始高面数物体与游戏减面物体均存在。读取结果保存在 `blender-scene-audit.json`。

| 分类 | 实际资源 | 材质与用途 |
|---|---|---|
| 近景立面 | `models/neon-facade.glb`，112431 三角形 | 原有 4096 底色图；主页/赛车城主体，未缩小这张贴图 |
| 人像广告巨构 | `models/billboard-tower.glb`，80000 三角形 | 原有 2048 底色图；修正坐标轴，替换赛车城相应 30000 面显示原型 |
| 商业浮岛 | `models/sky-platform-a.glb`，55000 三角形 | 原有 1024 底色图；修正坐标轴，替换赛车城相应 30000 面显示原型 |
| 悬浮板块 | `models/sky-platform-b.glb`，54999 三角形 | 原有 1024 底色图；主页上空构图 |
| 机械塔 | `models/homepage-buildings.glb` 中的 04 节点 | 原始底色与发光图；保留为中远景，不再放在最接近相机的位置 |
| 地标与低层店面 | `models/city-kit.gltf` | 保留中央塔和低层店面；整套 6 种模型共 11984 三角形 |
| 赛车世界 | `models/racing-world.glb` | 原有城市、连续道路、护栏、装饰和距离原型 |
| 赛车 | `models/racing-vehicle.glb`，64000 三角形 | 原 Blender 总成与四轮，保留控制、碰撞、计时与重生 |
| 展示车/磁驱车 | `models/yuheng-preview.glb`、`models/yuheng-drive.glb` | 保留底色、法线和金属粗糙度通道；PNG 转 WebP 后解码像素一致 |
| 人物 | `models/operative-walk.glb`，22000 三角形 | 保留皮肤、骨架与动作；主页仍显示 3 个角色 |
| 工坊 | `models/workshop.glb` | 保留原材质通道、碰撞与室内玩法 |
| 声音 | `studio/audio.js`、`data/soundtrack.json` | 保留合成环境声与赛车引擎。未发现本地歌曲文件，现有歌曲配置 `src` 为 null；没有补入商业录音 |

多数 Tripo 建筑只有底色图，部分另有发光图，**没有独立 Normal/Roughness/Metallic 图片**。本轮没有把固定金属度/粗糙度数值冒充完整 PBR 贴图。

## 2. 定位的问题与修复

1. 原主页用重复的简化高街墙遮住了精细资产。已移除这些主体街墙，保留道路、碰撞、低层入口和少量远景填充。
2. 原 Tripo 建筑被统一设置 `.34/.40/.52` 底色并替换部分 albedo。已撤销这条主场景覆盖，使用 GLTFLoader 还原的材质通道。
3. 两个精细导出与游戏坐标系不一致。已在资产配置中设置 X 轴修正，然后统一缩放、测量旋转后边界并锚定地面；没有拉伸建筑。
4. 原 30000 面近景原型存在明显减面痕迹。赛车城现在复用已有 55000/80000 面文件；升级网格在三轴上均保持在旧模型已检查的包围范围内，避免扩大到道路上。
5. 纯金属表面缺少环境反射时发黑。主页增加低分辨率光照环境，保留模型原底色；只让原贴图中本来明亮、饱和的灯牌像素发光，不让整栋建筑发光。已有发光图的材质继续使用原图。
6. 赛车城原白天云海与本次图 3 夜景方向不符。已调整天空、雾和灯光，关闭白色云海的显示，以真实城市资产补充下层空间。保留环境源文件。
7. 全量点光影响主页启动与渲染。现在从原有灯位中选择邻近 4 盏实际参与照明；保留方向光和一张 1024 阴影图。
8. 首页图标产生了实际 404。已补齐统一 SVG 图标，并为三个入口登记引用。

模型与图片的审计没有发现初始资源引用丢失，不能把所有粗糙表面归因于“贴图文件丢了”。本轮修复的是运行时覆盖、朝向、照明、资源登记与加载链路；没有重新烘焙或臆造缺失细节。

## 3. 资产调度与场景配置

- `data/city-scenes.json`：6 种可复用资产的真实路径、坐标修正、材质状态、地面锚点与适用场景，以及 31 个摆放对象、主页相机和赛车参考相机。
- `studio/scene-assets.js`：复用同一个 GLB 请求，保留原材质绑定，归一化比例/锚点，报告失败对象与 URL，管理资源释放。没有替换原工坊的 v2 资产库。
- 主页主体与 Blender 巨环必须加载成功后才允许进入；主体失败显示错误，不用纯色盒子充当最终建筑。远景与角色仍保留原有的独立加载逻辑。
- 赛车城新增摆放对全部 1601 个赛道采样点做车辆高度与道路宽度的保守包围盒检查。原 42 个实例继续使用原先的布局；升级的两个网格不会扩大旧包围范围。
- 场景返回时区分浏览器往返缓存与真正卸载，避免缓存页面恢复后使用已释放的模型。

保留 `racing-core.js`、`navigation.js`、委托/改造/存档与声音核心逻辑。没有把删除视觉建筑当成删除碰撞和玩法的理由。

## 4. 体积与导出链路

模型与图片从 **65,176,833 字节降至 59,418,542 字节（59.42 MB）**。恢复 `validate-assets.cjs` 的 60 MB 原预算，没有继续把上限提高到 100 MB。

- 展示车与磁驱车 PNG 以无损 WebP 打包，几何、UV、索引和解码后的纹理像素保持一致。
- 6 组重复的图片字节移入 `models/shared-textures.bin`。这是 glTF 标准的外部 buffer 依赖；相关 GLB 必须连同该文件交付，不能只复制单个 GLB。已在浏览器验证底色、发光、Normal 和金属粗糙度通道。
- 仅远景 `floating-city.glb` 的 JPEG 转为 WebP 90，保持 2048 尺寸。这一项有损，不能称为像素一致。近景立面与精细广告塔图片未做这项有损转换。
- 原始 6 个文件保存在 `E:/Codex-AIGM/city-studio/assets/integration-source-backup`，不加入网页仓库。原 Blender/Tripo 源文件保留。
- 原 v2 `data/assets.json` 继续负责文件哈希，当前检查 46 个文件；7 个原工坊资产的美术审批状态继续为 pending-review，没有擅自标为通过。

复现工具：`audit-scene-assets.py`、`optimize-embedded-textures.py`、`share-model-textures.py`、`register-scene-assets.py`。日常只需运行审计与验证。重新从源导出或提取后，应重新执行共享打包、登记与验证，不能遗漏 sidecar。

## 5. 验证证据

自动测试 **103/103 通过**，覆盖原有委托与存档、声音、碰撞、完整一圈反馈驾驶、交叉层赛道，以及新加载器的请求复用、地面锚定、材质保留、失败重试和资源释放。日志：`asset-integration-tests.txt`。

真实 Chrome/WebGL 验收 **11/11 通过**，正常流程观察到的控制台错误和 HTTP 资源错误为 **0**。故障测试主动返回 404 的页面单独记录，不混入正常流程。证据在：

`E:/Codex-AIGM/scene-delivery/asset-integration/verification.json`

| 浏览器检查 | 结果 |
|---|---|
| 主页 10 处主体、原材质状态、6 个主要模型各请求一次 | 通过 |
| 实际 W 行走、三个观景位置、返回街口 | 通过 |
| 实际走到入口并按 E 传送 | 通过 |
| 赛车城新增 21 处、道路采样校验、升级包围范围 | 通过 |
| 倒计时、油门、转向 | 通过 |
| 暂停位置与计时冻结、重新发车、R 重生 | 通过 |
| 开启赛车声音 | 通过 |
| 从比赛/暂停界面返回工坊，v2 资源库载入 | 通过 |
| 返回赛车城、刷新重新进入 | 通过 |
| 390×844 主页与赛车城，无横向溢出 | 通过 |
| 主体 GLB 故意 404，错误可见且进入按钮禁用 | 通过 |

这里的浏览器驾驶验证是实际短程操作；完整单圈与检查点闭环来自自动测试，**没有宣称浏览器人工跑完了整圈**。手机检查是桌面浏览器视口模拟，不代表真机触控驾驶已支持。

真实性能数值及测量窗口另见同目录 `performance.json`。冷启动包括 GPU 着色器编译与后续角色载入，曾记录较低初始帧率，原有自动均衡策略会介入；不能把初始值和稳定帧率混作同一种测量，也不能承诺所有硬件均为 60 FPS。

稳定测量使用本机 Chrome、1440×900，等待 ready 后再预热 11 秒，分别测量两段 3 秒的 requestAnimationFrame。主页自动均衡后为 70.6/72.9 FPS；赛车城高画质、像素比 1.0 为 84.4/84.1 FPS；工坊为 71.2/69.4 FPS。此次结果只代表本机该视角。辅助脚本保存在 `E:/Codex-AIGM/tmp/probe-city-performance.cjs`。

实际运行截图：

- `home-overview.png`、`home-overlook.png`、`home-street.png`
- `race-overview.png`、`race-driving.png`
- `studio-preserved.png`、`home-mobile.png`、`race-mobile.png`
- `required-asset-failure.png`
- `before-home.png`、`before-race.png` 为本轮修改前的真实浏览器截图。

以上均位于 `E:/Codex-AIGM/scene-delivery/asset-integration`。没有使用概念图充当运行截图。

可复现命令（先在本机启动静态服务器）：

```powershell
python scripts/audit-scene-assets.py
node scripts/validate-assets.cjs
node --test studio/core.test.cjs studio/gameplay.test.cjs studio/audio.test.cjs studio/progress.test.cjs studio/presets.test.cjs studio/experience.test.cjs studio/scene-assets.test.cjs racing-core.test.cjs racing-world.test.cjs
node scripts/verify-scene-integration.cjs
git diff --check
```

浏览器验证使用本机已有 Chrome 和 Playwright，未安装依赖。可通过 `BASE_URL`、`EVIDENCE_DIR`、`CHROME_PATH` 指定环境。

## 6. 如何亲眼验收与剩余范围

1. 打开 `http://127.0.0.1:8767/`。看到两侧真实 Tripo 立面、居中巨环和湿街；点击“观景漫游”，用 W/A/S/D 行走并切换观景台。长期停在加载或出现错误遮罩即为失败。
2. 打开 `http://127.0.0.1:8767/booze.html`，先看夜景与建筑层次；点击“开始单圈计时”，用 W/A/D、空格、R 测试驾驶与重生，再测试暂停和返回街区。车辆不能动、赛道被建筑堵住或重新进入黑屏即为失败。
3. 返回 `studio.html?from=race`，检查原委托、工坊、自由搭建、改造与声音设置。原歌曲没有本地媒体源，不应把它显示成已播放。

当前服务只供本机访问。如果已关闭，在本目录运行原 `start-local.ps1`；不要直接双击 HTML 加载模型。

本轮未完成的是参考图 3 的逐栋、全街市高密度复刻，以及在更多硬件上的真机性能/移动触控验证。原资产部分减面表面仍有可见质量上限；本轮已经优先使用现有更精细导出，但没有伪称补出了源文件不存在的贴图。

本地改动尚未提交或上线。后续提交必须按仓库 `AGENTS.md` 的要求，先由用户核对下面的实际文件清单。

<!-- file-list -->

| 文件 | 板块 |
|---|---|
| `booze.html` | 入口与屏幕适配 |
| `data/assets.json` | 场景配置 |
| `index.html` | 入口与屏幕适配 |
| `models/city-ring.glb` | 资源与材质 |
| `models/floating-city.glb` | 资源与材质 |
| `models/homepage-buildings.glb` | 资源与材质 |
| `models/racing-world.glb` | 资源与材质 |
| `models/yuheng-drive.glb` | 资源与材质 |
| `models/yuheng-preview.glb` | 资源与材质 |
| `racing-environment.js` | 赛车场景 |
| `racing-world.js` | 赛车场景 |
| `racing-world.test.cjs` | 回归测试 |
| `racing.css` | 入口与屏幕适配 |
| `racing.js` | 赛车场景 |
| `scene.css` | 入口与屏幕适配 |
| `scene.js` | 主页场景 |
| `scripts/extract-homepage-assets.py` | 验证/导出工具 |
| `scripts/validate-assets.cjs` | 验证/导出工具 |
| `studio.html` | 入口与屏幕适配 |
| `data/city-scenes.json` | 场景配置 |
| `images/district-mark.svg` | 资源与材质 |
| `models/shared-textures.bin` | 资源与材质 |
| `reports/asset-integration-delivery.md` | 审计与交付证据 |
| `reports/asset-integration-tests.txt` | 审计与交付证据 |
| `reports/asset-scene-audit.json` | 审计与交付证据 |
| `reports/blender-scene-audit.json` | 审计与交付证据 |
| `reports/shared-textures.json` | 审计与交付证据 |
| `reports/texture-optimization-jpeg.json` | 审计与交付证据 |
| `reports/texture-optimization.json` | 审计与交付证据 |
| `scripts/audit-scene-assets.py` | 验证/导出工具 |
| `scripts/optimize-embedded-textures.py` | 验证/导出工具 |
| `scripts/register-scene-assets.py` | 验证/导出工具 |
| `scripts/share-model-textures.py` | 验证/导出工具 |
| `scripts/verify-scene-integration.cjs` | 验证/导出工具 |
| `studio/scene-assets.js` | 共用资产调度 |
| `studio/scene-assets.test.cjs` | 回归测试 |
