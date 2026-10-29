# 继续盘点与接入现有资产

2026-10-29。本次基于当前连接的 `city-studio/assets/racing-world/racing-world-final.blend` 和项目现有 `models/racing-world.glb`，没有生成新的 3D 模型，也没有修改 Blender 源文件。

## 新增的六类原有建筑

从赛车城已有 GLB 提取六个不同原型至 `models/additional-city-buildings.glb`，保留其网格、UV、索引、原材质及纹理。`data/city-scenes.json` 将它们分散放在主页的中远景，不占中央行走道路。

| 原资产编号 | 原场景中的名称 | 源资产 ID |
| --- | --- | --- |
| 05 | 右塔下层工业承台 | `3a4996e3-841b-46f2-8ede-c1bd6fed3241` |
| 09 | 云海下层城市 | `619a4661-3288-4c63-87a3-ad668147ba33` |
| 13 | 右塔上方机械商业岛 | `8a645af9-9c73-48b0-9994-0c3202537d50` |
| 14 | 右后方悬臂广告塔 | `94a0394c-6e61-4845-8277-62d02277f5df` |
| 16 | 云海下层城市 | `a4a3b8ae-79cd-466c-a213-4ef674946fd6` |
| 25 | 右塔侧后工业浮塔 | `fdde7137-546a-42a3-9370-f8b08fe64ca7` |

原始名称是已有场景中的用途标注，不代表已对所有源模型做完整艺术分类。新资源包 6,925,796 字节，六个网格合计 179,988 三角面。现有原型本身约每个 3 万面，不是 Blender 中每个高面数源网格的完整精度。运行资源清单为 98,296,038 字节，其中不同页面只请求各自需要的资源。

## 另一位角色

从 Blender 的对象副本导出供检查：`city-studio/characters/tripo-generated/alternate-character-rigged.glb`。原网格 `tripo_node_77b70aef` 为 28,884 面、16,297 顶点，带 41 骨骼和打包的 4096×4096 贴图；与之前移除的 `tripo_node_337c1cc7` 不同。原场景对象和模型数据保持不变。

检查渲染 `E:/Codex-AIGM/scene-delivery/alternate-character-inspection.png` 显示紫色服装角色处于绑定姿态。当前连接的文件没有 Blender Action；已检查本地旧角色的 `operative-game.glb` 和原始角色文件也没有可直接给这个角色使用的动作，旧的 `operative-walk.glb` 只有原用户指出有问题的 Walk 动作。此角色尚未接入游戏；不能声称现在可以正常走路。街区当前仍可移动镜头，但没有可见玩家模型。

## 验证与范围

- `racing-world.test.cjs` 新增六项逐字节校验，比较新包和赛车源包中的几何、UV、索引、基础色贴图与源 ID。全部 114 项代码测试通过，记录 `reports/expanded-assets-tests.txt`。
- `node scripts/validate-assets.cjs` 校验 50 个资源文件，结果有效、无错误；7 项历史资产仍为待复核状态。
- Chrome 实测主页 20 项摆放全部加载，WASD 位置从 `-7.00,22.04,62.00` 变化至 `-7.13,22.04,56.88`；工坊及赛车页正常启动，正常请求和页面异常为零。原始数据 `E:/Codex-AIGM/scene-delivery/expanded-assets-verification.json`，实际主页截图 `E:/Codex-AIGM/scene-delivery/expanded-city-home.png`。本次没有完整复测比赛流程、全部任务或移动端。
- Tripo Studio 插件的云端资产目录未登录，未触发登录或付费生成。当前只核对了本地文件及连接的 Blender 工程；其他工程及尚未识别的网格仍未逐件确认，也不能声称所有资产已利用。概念图仍是参考图，游戏视觉尚未达到其效果。

打开 `http://127.0.0.1:8767/?v=expanded-assets-4`，点击「探索街区」查看实际场景。若本地服务已关闭，在 `Soren2077` 目录执行 `python -m http.server 8767 --bind 127.0.0.1`。
