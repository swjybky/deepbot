# 聊天 Markdown 本地文件链接验证

- 时间为 2026-11-24 22:15 PST 起。环境为 Ubuntu 26.04.1 LTS、Linux 7.0.0-43-generic、NSH 0.4.0（e626a8d）和 Node 26.13.1。使用 verify 的 Bubblewrap 实例 `0ca543d76a5cc5f7`，GTK 运行在私有 Xvfb 上。
- Git 基线为 `e3324505148f078e06725ca8b29470865efc6eb1`，含工作区改动。修改前源码指纹 `d7f312191569829a0a6bbd2587e2a12b376541d24af707a86b66429674ac667d`。修复测试替身后，在最终源码指纹 `47c0f3391d8335691f3d4d840bef99fa63dec5020fc0dfc304a8cb92fa1e0ed2` 下重跑打开和缺失文件场景。[重启结果](artifacts/verify-restart.json)
- 正式 `App.tsx` 连接真实 Node sidecar。将历史链接格式写入隔离 SQLite，再启动窗口从聊天快照回读。PNG 是原报错链接指向的[设置截图](../203000-model-image-input/screenshots/images-verified-mode-options.png)，复制件与原件的 SHA-256 均为 `338cb5e4232f7cdb3779cb20d4eb5dfd8f59ca80d405d4b8de308755f04fd57b`。文档、网页及登记产物使用隔离样例。实例内通过 XDG 默认应用关联把图片交给 Eye of GNOME，文本交给 gedit。
- 根因是聊天 Markdown 点击把本地绝对路径直接传给 NSH `openUrl`。修复后桌面发送结构化的消息 ID 和路径，sidecar 按消息所属 Bot 的当前文件权限和目录约束校验，复用登记产物的系统打开实现。行号及列号作为链接位置标记处理，系统应用收到文件路径。[桌面入口](../../../../apps/desktop/ui/state/runtime.ts) · [sidecar](../../../../packages/agent/src/runtime/app.ts) · [聊天功能地图](../../../../references/features/chat.md)

## 原生复现与复验

从小菜聊天直接点击已存消息里的链接。使用 `nsh test --target linux App.tsx` 的 GTK 输入驱动，系统打开结果以私有显示中的实际应用窗口和处理程序参数为准。

| 场景 | 实际结果 | 证据 |
| --- | --- | --- |
| 修改前点击「设置截图」 | 顶部显示 `openUrl: not a URL: relative URL without a base`。 | [原生复现](screenshots/links-baseline-failed.png) · [日志](logs/links-baseline.log) |
| 修改后再次点击「设置截图」 | 图片查看器显示原 PNG 内容，窗口标题为 `images-verified-mode-options.png`。 | [查看器窗口](screenshots/links-fixed-image.png) · [点击日志](logs/links-fixed-image.log) · [窗口标题](logs/links-fixed-image-window.log) |
| 点击「交付报告」 | `[交付报告](</data/linked delivery/交付 报告.md:3>)` 打开 gedit。标题和正文与样例一致，处理程序收到一个完整路径参数。 | [文档窗口](screenshots/links-fixed-document.png) · [点击日志](logs/links-fixed-document.log) |
| 点击「已移除文档」 | 顶部显示「无法打开文件：找不到文件」，聊天气泡和输入区保持原位。 | [缺失文件提示](screenshots/links-fixed-missing.png) · [日志](logs/links-fixed-missing.log) |
| 点击「网页」 | Chrome 加载隔离 HTTP 页面，显示 `LINK-WEB-VERIFIED`，服务端记录 HTTP 200。 | [点击前](screenshots/links-fixed-web-before-click.png) · [浏览器窗口](screenshots/links-fixed-web.png) · [窗口与点击日志](logs/links-fixed-web-window.log) · [HTTP 日志](logs/link-web-http.log) |
| 资料库点击已登记产物 | UTF-8 版本正文在弹窗中可预览。将同一隔离文件换成 UTF-16LE 后，弹窗显示预览限制和「使用系统应用打开」。点击后 gedit 显示同一正文。 | [内置预览](screenshots/links-fixed-artifact-inline.png) · [系统打开入口](screenshots/links-fixed-artifact-preview.png) · [gedit 窗口](screenshots/links-fixed-artifact.png) · [点击日志](logs/links-fixed-artifact.log) |

网页用 `nsh run --target linux --port 23116 App.tsx` 打开常规开发宿主，在私有 X11 窗口用 `xdotool` 点击。NSH 测试宿主只记录 `openUrl` 调用。Chrome 在无外网的 Bubblewrap 实例中使用独立配置目录和 `--no-sandbox` 启动。命令的 35 秒定时退出用于回收测试窗口。

逐张打开截图。聊天链接保留字体、下划线和位置，缺失文件仅显示顶部错误浮层。打开器日志确认截图、报告、网页及登记产物各自收到单个参数。[处理程序日志](logs/link-handlers.log) · [对话区布局](../../../../design/layout.md#对话区) · [统一反馈](../../../../design/components/feedback.md)

记录实际桌面进程发出的 `message.open-file` 命令及同一请求 ID 的回复。带空格的报告以绝对路径传入并收到 `ack`，缺失文件收到「找不到文件」。[协议记录](artifacts/link-protocol.jsonl)

## 检查与回归

- 桌面回归覆盖历史链接、尖括号内的空格、`%20`、`:行`、`:行:列` 和 HTTPS 分流。Agent 回归覆盖重复请求、相对路径、缺失文件、越界路径及符号链接，以及权限关闭和目录断开后的拒绝。[桌面回归](../../../../apps/desktop/tests/markdown.test.tsx#L33) · [Agent 回归](../../../../packages/agent/tests/runtime.test.ts#L450)
- 首轮全量发现桌面测试替身在打开请求后发了旧快照，覆盖了注入的历史消息。测试替身改为像真实 sidecar 一样回复 `ack` 后，Markdown 专项 3/3 通过。[首轮 JSON](artifacts/verify-first-check.json) · [首轮桌面日志](logs/first-ui-test.log)
- `pnpm --silent verify ui run library-artifact --target native --run 0ca543d76a5cc5f7` 退出 0，资料库列表、整行打开与弹窗正文通过。[场景结果](artifacts/verify-library-native.json) · [场景日志](logs/verify-library-native.log) · [列表](screenshots/verify-artifact-listed.png) · [弹窗](screenshots/verify-artifact-preview.png)
- `pnpm --silent verify check --run 0ca543d76a5cc5f7` 退出 0，`ok: true`，9/9 检查全部通过。Agent 100/100，桌面 90/90，控制 CLI 15/15。[全量检查 JSON](artifacts/verify-check.json) · [Agent 日志](logs/agent-test.log) · [桌面日志](logs/ui-test.log) · [控制 CLI 日志](logs/control-test.log)
- `pnpm --silent verify evidence report --run 0ca543d76a5cc5f7` 退出 0，`status: passed`，`visualStatus: passed`，缺项和失败项均为空。归档后 `env stop` 退出 0。[证据汇总](artifacts/verify-evidence-report.json) · [原图复核](artifacts/verify-visual-review.json) · [停止结果](artifacts/verify-stop.json)

## 验收结论

最终源码在隔离 Linux GTK/X11 窗口通过历史截图、Markdown 报告、缺失文件、网页及登记产物的原生验证，现有文件访问范围也通过回归检查。交付范围为源码和隔离证据，Wayland、macOS、Windows 和正式安装窗口未参与本轮复验。

![从历史消息打开的原设置截图](screenshots/links-fixed-image.png)
