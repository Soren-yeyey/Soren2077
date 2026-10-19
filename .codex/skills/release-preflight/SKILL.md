---
name: release-preflight
description: 对静态网页或浏览器游戏执行发布前检查，验证公网可访问性、本地资源引用、密钥泄露和素材体积预算，并输出不可虚报的通过、失败或阻断结果。
---

# 发布前检查

在准备提交、推送或发布静态网页项目时使用本 Skill。先读取项目内的 `AGENTS.md` 和发布说明，确定正式公网地址与必须存在的页面；不要把本地开发地址当作公网通过证据。

## 执行

运行本 Skill 自带的确定性脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .codex/skills/release-preflight/scripts/check-release.ps1 `
  -ProjectRoot . `
  -PublicUrl "https://example.github.io/project/" `
  -RequiredPath "/", "/studio.html" `
  -OutputPath "reports/release-preflight.md"
```

根据项目规则调整 `-ImageTotalLimitMB`、`-ReleaseAssetLimitMB` 和 `-SingleImageLimitMB`。未经用户明确同意，不要为了得到通过结果而扩大预算、排除失败文件或缩小必需页面范围。

脚本检查：

- 公网地址及必需页面是否返回成功状态；网络无法验证时标记“阻断”。
- HTML、CSS 和脚本中的静态本地资源引用是否存在。
- Git 会纳入提交的文本文件是否含疑似密钥、私钥或连接串；报告只写类型、文件和行号，不回显原值。
- 单张图片、全部图片以及发布素材总量是否符合预算。

退出码 `0` 表示全部通过，`1` 表示至少一项失败，`2` 表示至少一项无法执行或验证。命令运行结束本身不代表检查通过。

## 报告与处理

保留脚本生成的 Markdown 报告，向用户说明每个失败项的证据与影响。没有得到修复授权时只报告，不顺手修改项目。

如果用户要求证明检查器能发现问题，只能使用无效的测试密钥或临时缺失引用。将测试文件放在项目内、确认检查失败并保存证据后立即删除；不得使用真实密钥，不得把临时故障提交到 Git。随后重新检查，区分测试故障与项目原有问题。
