# 聊天动态输入框验证记录

- 2026-11-24 19:21–19:37 PST。Git 基线 `e332450` 加工作树，verify 轮次 `bbe94df75fb20e56`。最终场景和检查的源码指纹为 `ce15393356adfac2a1cd845a4353045ff804a8cbc9c0def15a5f387d9246bd08`。
- Linux 7.0.0-43-generic、GTK 4.22.4、NSH 0.4.0（e626a8d）、Node 26.13.1。私有 Xvfb，`GDK_BACKEND=x11`、Cairo、Noto Sans CJK SC。原生窗口实测 1280×800 和 920×800，verify 场景截图截取 1270×790 的内容区。
- 原生场景和补充实操均从 `App.tsx` 启动，使用真实 Node sidecar 和独立 SQLite。模型是隔离网络里的本地替身。图片实操配置为支持图像的 `gpt-4o`，替身记录收到的图像摘要。

## 原因与实现

按 feature 剧本执行。旧版 [MessageInput](/home/swj/project/deepbot/apps/desktop/ui/components/MessageInput.tsx:3) 未启用 `multiline`，用 `h-10` 固定 40pt。[Composer](/home/swj/project/deepbot/apps/desktop/ui/features/chat/Composer.tsx:111) 用 `h-12` 固定 48pt。NSH 0.4 的 `InputConfig::default` 选择单行，`Core::input_text` 也按一行测量。GTK 的 [new_editor](/home/swj/project/deepbot/vendor/nsh-platform-linux/src/text_input.rs:887) 将该分支挂成 `GtkText`，文字超出宽度时在控件内部横向移动。[attach](/home/swj/project/deepbot/vendor/nsh-platform-linux/src/text_input.rs:757) 监听原生 `activate`，实测普通回车发出一条消息，Shift+Enter 后输入仍是一行，协议里没有第二次发送。

新版启用 NSH 的多行模式，`Core::measure_input` 与 `measure_leaf` 按可用宽度测量文字。应用限制文字区为 40–160pt（含内边距）。GTK 多行分支已经使用 `GtkTextView` 的 `WordChar` 折行和 `GtkScrolledWindow`。[place](/home/swj/project/deepbot/vendor/nsh-platform-linux/src/text_input.rs:1052) 把 NSH 的内容盒分配给滚动窗。[submits](/home/swj/project/deepbot/vendor/nsh-platform-linux/src/text_input.rs:1441) 区分普通回车和 Shift+Enter，提交前先让输入法处理按键。改动位于应用层输入和布局。图片、引用、草稿及发送沿用现有入口。

左侧按钮复用项目的 `plus` 图标。无障碍名和按钮容器的 NSH `Tooltip` 共用「添加附件」，测试定位为 `composer-add-attachment`。GTK 选择器默认过滤图片，也能通过路径选择其他文件，此时应用按 MIME 校验，通过统一反馈显示「当前附件仅支持 PNG、JPEG、WebP 图片」。附件发送继续走现有 `message.send-images`。

## 原生操作与看图复核

逐图对照[消息输入条](../../../../design/components/input.md#消息输入条)、[对话区](../../../../design/layout.md#对话区)、[图标](../../../../design/components/icon.md)和[圆角与文字规格](../../../../design/tokens.md)。在实际 GTK 窗口用 `xdotool` 投递鼠标、键盘事件，用 `xclip` 写入、读回系统剪贴板。用 `xwd` 截取窗口，再转 PNG。

| 操作 | 实际结果 | 截图 |
| --- | --- | --- |
| 基线粘贴中文长句再按 Shift+Enter | 48pt 输入条只显示横向滚动后的一行，草稿保持待发送。前置短句按普通回车已发送并收到回复。 | [基线长句](screenshots/baseline-long.png)、[Shift+Enter 后](screenshots/baseline-shift-return.png) |
| 输入短句、继续写连续中文 | 48pt 输入条随折行增到 72pt，加号按钮、发送按钮与输入条底边保持原位置，正文左右留白。 | [短句](screenshots/verify-01-short.png)、[软换行](screenshots/verify-02-wrapped.png) |
| 粘贴 12 行，滚轮上下，再清空 | 框内可由第 1–6 行滚至第 7–12 行，输入条一直是 168pt，聊天记录位置没有变化。清空回到 48pt。 | [首段](screenshots/native-capped-top.png)、[末段](screenshots/native-capped-end-again.png)、[清空](screenshots/native-shrunk.png) |
| 窄栏粘贴 360 个连续数字，再连续按 Shift+Enter 输入八行 | 无空格内容按宽度折行。逐行输入超过上限后，第八行及光标出现在编辑框底部。 | [连续数字](screenshots/native-unbroken.png)、[输入到第八行](screenshots/native-typing-end.png) |
| 选中输入的文字贴中文，Shift+Enter 和普通回车 | Ctrl+V 完整替换选区。Shift+Enter 插入一处换行，普通回车发送，sidecar 收到的正文字逐字相同。 | [手动换行](screenshots/native-manual-newline.png) |
| 悬停左侧加号 | 原生浮层显示「添加附件」，与场景定位的无障碍名一致。控制按钮留在输入条底部。 | [加号和悬停提示](screenshots/native-attachment-tooltip.png) |
| 点加号，通过系统选择器确认 `note.txt` | 顶部提示「当前附件仅支持 PNG、JPEG、WebP 图片」。草稿和已有 PNG 缩略图保留，随后能继续选 JPEG。 | [尝试选择文本文件](screenshots/native-picker-invalid.png)、[提示和加号](screenshots/native-unsupported-file.png) |
| 粘贴 PNG、选择 JPEG、引用回复、切换 Bot | 图片粘贴前后的文字草稿逐字相同。系统选择器添加 JPEG 后两个缩略图保持比例。切回原 Bot 后恢复引用、图片和原文，另一个 Bot 保留自己的草稿。 | [选择文件](screenshots/native-picker.png)、[恢复草稿](screenshots/native-restored-draft.png)、[另一份草稿](screenshots/native-second-draft-restored.png) |
| 附图时打开信息栏、收窄窗口，再移除第三张图并发送 | 三张图在 320pt 对话列里排成两行，引用、缩略图、文字各占独立区域。移除第三张后正文折行、输入条及按钮位置相同。回车后后端确认，图片进入消息气泡，输入条回缩。 | [窄栏](screenshots/native-narrow-attachments.png)、[移除后](screenshots/native-image-removed.png)、[发送后](screenshots/native-images-sent.png) |
| 新场景输入超过六行并点击发送 | 长文封顶后气泡显示完整正文，收到 `DEEPBOT_VERIFY_OK`，输入条回到 48pt。 | [封顶](screenshots/verify-03-capped.png)、[发送回缩](screenshots/verify-04-sent.png) |

两次原生发送均有对应 ack，附件消息携带原始手动换行和正确的 `replyTo`。本地模型替身收到两张图片。Chromium 的 `chat-send` 也通过，读取同一后端的快照比对了用户消息和 Bot 回复。[原生断言](artifacts/native-assertions.json)、[原生协议](logs/composer-native-protocol.jsonl)、[模型接收摘要](logs/composer-native-model.jsonl)、[浏览器读回](artifacts/verify-browser-snapshot.json)

## 检查

| 命令（仓库根目录，`--run bbe94df75fb20e56`） | 结果 | 证据 |
| --- | --- | --- |
| `pnpm --silent verify ui run chat-composer --target native` | 退出码 0，场景通过 | [原生场景](artifacts/verify-ui-native.json)、[日志](logs/verify-chat-composer.log) |
| `pnpm --silent verify ui run chat-send` | 退出码 0，场景通过 | [浏览器场景](artifacts/verify-ui-browser.json)、[日志](logs/verify-chat-send-browser.log) |
| `pnpm --silent verify api snapshot` | 退出码 0，核对浏览器场景消息 | [快照](artifacts/verify-browser-snapshot.json) |
| `pnpm --silent verify check` | 退出码 0，9/9 项通过。Agent 98/98、桌面 88/88、控制 CLI 15/15 | [全量检查](artifacts/verify-check.json)、[Agent](logs/agent-test.log)、[桌面](logs/ui-test.log)、[控制 CLI](logs/control-test.log) |
| `pnpm --silent verify evidence report` | 退出码 0，`status: passed`，`visualStatus: passed` | [证据汇总](artifacts/verify-evidence-report.json)、[看图复核](artifacts/verify-visual-review.json) |

原生场景第一次用 `submit` 没触发多行控件发送。改用场景的按钮动作验证发送，用真实键盘事件独立验收回车及 Shift+Enter。可以为原生场景增加组合键和滚轮步骤，让这两项直接出现在 CLI 报告中。[首次场景结果](artifacts/verify-initial-submit-failure.json)、[原生操作日志](logs/composer-native-actions.log)

## 验证边界

覆盖 Linux GTK X11、系统文本和位图剪贴板、文件选择、引用、按 Bot 切换的会话内草稿、真实 sidecar 与本地模型替身。Wayland、其他系统、真实输入法候选上屏及在线模型未实测。交付范围为源码工作树。
