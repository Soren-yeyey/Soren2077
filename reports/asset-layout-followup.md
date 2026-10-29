# 资产布局与角色检查

2026-10-29。本轮根据用户要求，用现有模型整理明亮街区，移除有问题的行走人物，生成一张构图参考。修改仅在本地，未发布。

## 参考图与当前游戏

`reports/city-layout-concept.png` 是使用内置 imagegen 生成的构图参考，不是实际运行截图。提示词要求明亮蓝白天空、中心粉色圆环、宽阔湿润步道、两侧有间隔的建筑、广告塔、远处细塔和停放车辆，避免密集遮挡或新增人物。图中的建筑具体外观和道路细节是生成结果，现有模型不保证一一对应。

本地实际截图：`E:/Codex-AIGM/scene-delivery/world-asset-layout.png`、`viewport-asset-layout.png`、`race-world-asset-layout.png`。目前主页使用圆环作为焦点和可通行的中心走道，并沿两侧增加了城市资产库中 `08_ORION`、`09_NC77`、`10_AdCylinder`、`12_KAEL` 四类模型；这些新增摆放基于已有 `models/city-kit.gltf`，未生成新的 3D 模型。实际效果仍与构图图有明显差距，尤其是建筑形态、天空占比和道路细节。

## 人物

从主页和工坊移除了 `models/operative-walk.glb` 的可控人物以及主页中的同模型行人，保留源文件。街区仍可用 WASD 移动并拖动鼠标转动镜头；目前没有可见玩家模型，不能算已恢复完整第三人称人物体验。

连接的 Blender 文件 `E:/Codex-AIGM/city-studio/assets/racing-world/racing-world-final.blend` 中有另一个带 41 根骨骼、28,884 面、UV 和材质的模型：骨架 `56a69478-8c42-4ed0-8caa-24f9687e0a79`，网格 `tripo_node_77b70aef`。之前使用的 GLB 网格名是 `tripo_node_337c1cc7`，两者不是同一网格。当前连接的工程中 Blender 动作库为零，不能据此保证新角色具备可用行走动作；未擅自把旧动作套用到新角色，也没有删除 Blender 中任何源角色。

## 资产检查与剩余工作

当前连接的是上面的赛车场工程，其中包含多个场景和大量重复布景实例。源 `Collection` 包含 10 个高面数 Tripo 网格，其中有一个重复副本，另有 24,708 面、22,499 面、28,298 面和 34,771 面的独立网格，以及上述角色；这些计数本身不能判定其具体用途。现有清单 `reports/asset-scene-audit.json` 还列出了工作区中可找到的其他 Blender、GLB 和贴图资源。

本轮增加四类已有网页资产，并没有完成对所有 Blender 工程和新增资产的逐件可视辨认，也不能声称已把全部资产用进场景。需要进一步确认其他工程里哪些是用户所指的昨日导入资产、各自内容和可用动作，再按空间和性能适配；不适合仅凭文件名或面数猜用途。

## 本轮修改及检查

- `scene.js`、`studio/app.js`、`index.html`、`studio.html`：移除场景中的旧角色和关联加载，保留街区导航与工坊；修正提示文字。
- `data/city-scenes.json`、`data/assets.json`：添加已有城市模型的四项定义及主页摆放，更新文件清单哈希。
- `reports/city-layout-concept.png`、`reports/asset-layout-followup.md`、`reports/asset-layout-tests.txt`：参考图与记录。
- 108 项代码测试通过；资源校验通过。实际 Chrome 检查了主页、工坊、赛车页启动、主页 WASD 移动、14 个主页摆放、模型请求和脚本错误，正常流程错误为零。结果见 `E:/Codex-AIGM/scene-delivery/asset-layout-verification.json`。本轮没有重新完整验收赛车驾驶、全部任务及手机操控。

生成方式：内置 imagegen。实际提示词：

> Create one practical concept illustration for a browser-based 3D game level, landscape 16:9. Bright overcast blue-white daylight, cyber-futuristic city. Use a restrained feasible composition grounded in existing assets: a broad wet elevated pedestrian street with clear empty walking corridor in the center; a large pink illuminated mechanical circular gateway at the end of the street; a few separately spaced detailed dark-blue metallic Tripo-style towers with cyan and magenta windows on both sides, one portrait-screen tower, a slender central spire glimpsed through the ring, small elevated platforms in the distance, simple barriers and a parked futuristic sports car. Natural gaps and distinct silhouettes between every building, camera at human height behind the walkway, scene is easy to read and light enough to see all materials. Modest real-time game quality and plausible asset scale, no dense photorealistic megacity, no floating buildings blocking the road, no UI, no text, no characters. This is a scene composition proposal, not a screenshot.
