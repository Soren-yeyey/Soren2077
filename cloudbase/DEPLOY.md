# CloudBase 部署指南 —— 夜班 SOLITUDE（Day 15）

> **✅ 2026-10-03 已部署完成**（CLI 通道，见文末「CLI 快速通道」）：
> - 云函数公网地址：`https://soren2077-d9gn6rr04d2c15165.service.tcloudbase.com/api/health`
>   实测返回：`{"ok":true,"service":"Night shift-SOLITUDE"}`（HTTP 200）
> - 前端公网地址：`https://soren2077-d9gn6rr04d2c15165-1499948517.tcloudbaseapp.com`
>   （index.html + libs 七件 + images 八图全部 200，标题「夜班 SOLITUDE」）
> - 环境：`soren2077-d9gn6rr04d2c15165`（体验版 · 上海 · 到期 2027-04-03）

> 原始目标：① `/api/health` 云函数公网可访问返回 JSON；② 前端整站公网可打开。
> 今天不做：真实业务接口、数据库建表、跨域配置（Day 16–20）。

## 0. 名词速查

| 名词 | 是什么 | 在哪看 |
|---|---|---|
| 环境 ID | 一个 CloudBase 环境的唯一标识，形如 `nightshift-8g0abc1234` | 控制台首页 |
| 云函数 | 跑在腾讯云上的 Node.js 代码，本仓库在 `cloudbase/functions/` | 控制台「云函数」 |
| 云接入（HTTP 访问服务） | 给云函数分配公网 URL 的开关 | 控制台「云函数 → 云接入」或「HTTP 访问服务」 |
| 静态网站托管 | 放 HTML/图片的网站空间 | 控制台「静态网站托管」 |
| 默认域名 | 免费的公网域名，静态托管是 `<环境ID>.tcloudbaseapp.com` | 对应服务页顶部 |

控制台入口：**https://tcb.cloud.tencent.com**（腾讯云账号登录）。
控制台改版较频繁，下面步骤里如果菜单名对不上，找**关键词相同**的入口即可。

---

## 1. 注册并开通环境（人工操作，约 10 分钟）

1. 打开 https://tcb.cloud.tencent.com ，用 QQ / 微信 / 腾讯云账号登录
2. 首次进入会要求**开通 CloudBase**：选择「按量付费」即可（有免费额度，本项目用量极小）
3. 创建第一个环境：
   - 环境名称：`nightshift`（随意，只给自己看）
   - **地域**：上海或广州
   - 计费方式：按量付费
4. 创建完成后，控制台首页复制**环境 ID**（形如 `nightshift-xxxxx`），后面到处要用

⚠️ 截图点①：**控制台首页**——要能看到「环境 ID、剩余额度、到期日期」三样信息。

## 2. 部署云函数 api-health

代码已准备好，就在仓库 `cloudbase/functions/api-health.zip`（含 `index.js` + `package.json`，零依赖）。

1. 控制台左侧 → **云函数** → **创建云函数**
2. 函数名称：`api-health`（必须完全一致，后面路径用到）
3. 运行环境：**Nodejs 16.13** 或更高（18 也行）
4. 创建方式 / 上传方式：**本地上传 zip 包** → 选 `D:\workbuddy\cloudbase\functions\api-health.zip`
5. 内存 / 超时：默认（128MB / 3s）即可 → 确定，等状态变「部署成功」

### 开通公网访问（云接入 / HTTP 访问服务）

1. 云函数页面找到 **「云接入」**（或叫「HTTP 访问服务」）→ 开通 / 新建服务
2. 添加路径映射：
   - 路径：`/api/health`
   - 关联资源：云函数 `api-health`
3. 发布（有的版本叫「点击发布」——不加这步公网 404）

### 浏览器验证

公网地址格式：**`https://<环境ID>.service.tcloudbase.com/api/health`**

浏览器直接打开，应看到：

```json
{"ok":true,"service":"Night shift-SOLITUDE"}
```

⚠️ 截图点②：**浏览器地址栏 + 返回的 JSON** 同框。

## 3. 前端整站上传静态托管

夜班是单文件架构，无需构建，直接上传现有文件。

1. 控制台左侧 → **静态网站托管**（首次进会提示开通，选默认即可）
2. 开通后获得默认域名：`https://<环境ID>.tcloudbaseapp.com`
3. 上传（网页版支持拖拽 / 多选）：

| 本地文件 | 上传到（相对根目录） |
|---|---|
| `index.html` | `/`（根目录） |
| `libs/three.min.js` | `/libs/three.min.js` |
| `libs/three/` 下 6 个 js | `/libs/three/` |
| `images/` 下全部图片 | `/images/` |

   不用传的：`PRD.md`、`TECH_DESIGN.md`、`TESTING.md`、`api-contract.md`、`cloudbase/`、`.workbuddy/`（文档和工具目录，不是页面资源）

### 浏览器验证

1. 电脑浏览器打开 `https://<环境ID>.tcloudbaseapp.com`——应看到夜班 3D 街区首页
2. **手机浏览器打开同一地址**——同伴手机也能打开即达标（横屏体验）
3. 若页面空白：F12 → Network 看是哪个 404（多半是路径没对上，对照上表）

⚠️ 截图点③：**前端公网页面**（带地址栏）。

## 4. 今天明确不做

- ❌ 数据库建表（Day 16）
- ❌ 真实业务接口（契约见 `api-contract.md`，只登记占位）
- ❌ 跨域 CORS 配置（接口还没接，Day 16–20 再说）

## 5. 出问题怎么办

| 症状 | 大概率原因 |
|---|---|
| 函数地址 404 | 云接入路径没点「发布」；或路径写成 `/api-health` |
| 函数地址 500 | 运行环境选错（必须是 Nodejs）；或 zip 传的是文件夹套了一层 |
| 静态页 404 | `index.html` 没传到根目录；文件名大小写不一致 |
| 3D 页面黑屏 | `libs/` 没传全（three.min.js + three/ 六件） |
| 免费额度提示 | 按量付费额度足够本项目；截图里把「剩余额度/到期日期」拍进去即可 |

---

## 附：CLI 快速通道（本次实战验证有效，供以后更新部署用）

环境：`tcb` 在托管 node 全局，需先 `export PATH="/c/Users/18730/.workbuddy/binaries/node/versions/22.22.2-5:$PATH"`；已 `tcb login` + `tcb env use`。

**⚠️ 三个血泪坑（都是本次实测踩出来的）：**

1. **`tcb fn deploy --dir <路径>` 有严重 bug**：`--dir` 会把 `functionPath` 置为 `'.'`，导致打包器压缩**当前工作目录整个项目**（含 .git）→ zip 模式必报「ZipFile 上传不能大于 1.5MB」，COS 模式必超时挂死。
   **正确做法**：造标准布局 `stage/functions/api-health/{index.js,package.json}` + `cloudbaserc.json`，`cd stage` 后**不带 `--dir`** 部署。
2. **`--path` + 云端装依赖 = 函数状态异常**：默认配置 `installDependency: Yes`，创建函数时云端装依赖会超时，函数卡「异常」状态，后续部署全部报「函数状态异常，检查超时」。**cloudbaserc.json 里必须 `"installDependency": false`**。
3. **被杀的部署留残骸**：每次中途杀掉的部署都会留下「更新中/异常」状态的函数壳，新部署会等它恢复直到超时。**恢复流程**：`echo y | tcb fn delete api-health` → `tcb fn list` 确认空 → 重新部署。

**更新部署标准流程：**

```bash
cd /tmp/fnstage   # stage 目录（functions/api-health + cloudbaserc.json 已备好）
export PATH="/c/Users/18730/.workbuddy/binaries/node/versions/22.22.2-5:$PATH"
export NO_PROXY="localhost,127.0.0.1"; export MSYS_NO_PATHCONV=1
tcb fn deploy api-health --deployMode zip --force          # 更新函数（zip 直传秒级）
tcb fn deploy api-health --deployMode zip --force --path /api/health   # 含 HTTP 映射
tcb fn invoke api-health                                   # 本地触发验证
tcb hosting deploy index.html index.html                   # 更新静态文件（逐个/逐目录）
tcb hosting deploy images images
tcb hosting deploy libs libs
```

**验证：**

```bash
curl https://soren2077-d9gn6rr04d2c15165.service.tcloudbase.com/api/health
# {"ok":true,"service":"Night shift-SOLITUDE"}
```
