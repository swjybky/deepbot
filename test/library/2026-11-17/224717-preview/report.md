# 资料库原生预览验证

- **时间与验证人**　2026-11-17 22:47–22:52 PST（UTC−08:00），Codex
- **目标**　文件、链接、文字和记忆使用单行条目，点击整行打开阅读弹窗。实际本机文件内容在弹窗查看。
- **代码**　`e3324505148f078e06725ca8b29470865efc6eb1` 工作区。改动涉及 `ArtifactCard`、`BotInfoPanel`、`LibraryPreviewDialog`、共用 Modal、预览选择状态和原生文件读取。共享工作区同时包含独立的配置和对话改动。
- **环境**　Ubuntu 26.04.1、Linux 7.0.0-43-generic、NSH 0.4.0 (e626a8d)、GTK Wayland、测试驱动点击、1280×800、1×、Noto Sans。
- **数据**　隔离的 Bot 协议 Fixture。真实读取仓库中的 UTF-8 样例 [Markdown](../../../../apps/desktop/tests/fixtures/library-preview.md) 和 [PNG](../../../../apps/desktop/assets/deepbot.png)，并请求不存在的文件。
- **结论**　类型检查、全量 80 项测试、Linux 原生文件和记忆专题通过。用户现有资料待独立验收。

## 复现与预期

1. 打开资料库并核对条目。点文件标题后，确认居中弹窗显示关联文件中的中文内容或图像。
2. 关闭后回到原列表位置。点链接时预览地址，用户点弹窗里的「打开链接」后才交给系统。
3. 从事项详情点文字产物，在弹窗核对完整文字。文件不存在时显示读取提示。
4. 点记忆查看正文，保存编辑后重新打开读取，验证删除及切换 Bot 后的内容归属。

## 代码检查

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `pnpm check` | 退出 0 | [类型与 Rust](logs/check-current.log) |
| `cargo test --manifest-path apps/desktop/Cargo.toml --locked` | 2/2 通过 | [读取单测](logs/rust-test.log) |
| `nsh test apps/desktop` | 退出 0，80/80 通过 | [全量测试](logs/headless.log) |
| `nsh test apps/desktop --target linux --filter 'bot info library tab'` | 修改前后各 1/1 通过 | [修改前](logs/native-before.log)、[修改后](logs/native-list.log) |
| `nsh test apps/desktop --target linux --filter 'library previews real'` | 1/1 通过 | [文件、图片和链接](logs/native-preview.log) |
| `nsh test apps/desktop --target linux --filter 'library preview shows a missing'` | 原生首次点击未触发，复测 1/1 通过 | [首次](logs/native-missing.log)、[复测](logs/native-missing-retry.log) |
| `nsh test apps/desktop --target linux --filter 'memories live under'` | 原生首次点击未触发，复测 1/1 通过 | [首次](logs/native-memory.log)、[复测](logs/native-memory-retry.log) |

检查日志未出现 `unknown class`。记忆原生复测运行时，共享工作区的独立对话改动有一条 `unsupported prop selectable`，该处随后已更新。

## 原生截图与对比

| 检查项 | 参照 | 本轮实际观察与结论 |
| --- | --- | --- |
| 条目结构 | [旧列表](screenshots/01-before.png) 内嵌路径、链接、状态文字和打开图标 | [新列表](screenshots/02-after.png) 使用等宽单行卡片，文件与链接行只显示标题，记忆行显示一行内容。通过 |
| 文件读取 | 旧条目显示文件路径 | [文件弹窗](screenshots/03-file-preview.png) 显示源文件中的中文段落和清单，与样例文件字句一致。标题栏与关闭入口位于正文之外。通过 |
| 图片读取 | 旧条目使用系统应用打开 | [图片弹窗](screenshots/04-image-preview.png) 显示实际 PNG，图像完整，以原比例居中适配。通过 |
| 记忆 | 旧版直接显示输入和删除图标 | [记忆弹窗](screenshots/05-memory-preview.png) 显示正文和明确的删除、编辑操作。原生复测覆盖保存、再次打开、删除和 Bot 隔离。通过 |
| 异常与链接 | 旧版跳转系统应用 | 原生复测确认缺失文件在弹窗中显示提示，关闭后恢复原列表。链接弹窗显示地址，未触发系统跳转。通过 |

已实际查看表中的原生原图。列表前后使用相同窗口与同一 Fixture；文件预览补充了真实测试文件与图片。

## 边界与复验

- 内置预览支持 UTF-8 文本、PNG、JPEG、GIF 和 WebP。文本预览显示前 256 KiB，图片限制 8 MiB。PDF、Office 等格式可在弹窗中使用系统应用打开。
- 使用真实本地文件验证原生读路径，Bot 数据来自隔离 Fixture。用户现有资料、其他平台、超长文件实际滚动和更小窗口待单独验证。
- 本机 `nsh run` 已提供新版 bundle，开发宿主可执行文件包含读取接口。现有窗口的个人资料未操作。
- 两次原生首点超时保存在日志中，同环境复测成功。参见 [Linux 输入既有问题](../../../../error/linux-native-input.md)。

对话展示 [资料库列表](screenshots/06-library-panel.png) 和 [文件弹窗](screenshots/03-file-preview.png)，前者裁自新列表原图。
