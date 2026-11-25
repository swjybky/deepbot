# 聊天发送图片闪烁验证记录

- 2026-11-24 23:00 PST 开始，Codex 执行。Verify 实例 `0d923003154bedc7`，Git 基线 `e332450` 加工作树。
- 修复前源码指纹 `10d9696d9e297eca2e6ea524cbdd129b0cc630d6ada82cb715ee1762b5a3d29b`。最终复验与全量检查的源码指纹 `6ef6a6a1b9839e0334448270115bcdbe5838c17cf68f4ebb0c882d16cbfb8d77`。两份快照之间还存在同期的 Bot 并发验收场景修改，发图场景全程走独立的原生驱动。
- Ubuntu 26.04.1 LTS，NSH 0.4.0（`e626a8d`），GTK X11 / Cairo，私有 Xvfb，窗口 1280×800。Bubblewrap 内启动正式 `App.tsx`、真实 Node sidecar、独立 SQLite 和本地流式模型服务。图片为程序生成的 520×340 棋盘格，剪贴板及文件选择器都在私有显示内操作。 [实例重载结果](artifacts/verify-restart.json)

## 复现与根因

聚焦输入框，输入正文，用系统剪贴板 Ctrl+V 粘贴合成 PNG。缩略图显示后点击发送。以约 120 fps 录制整个窗口到 Bot 回复出现。逐帧检查棋盘格的位置，并对照 sidecar 的入库快照、发送确认及图片读取事件。 [修复前录屏](artifacts/before.mp4) · [操作时间](logs/before-actions.jsonl) · [协议记录](logs/before-protocol.jsonl)

修复前第 214 帧还显示待发缩略图，第 215–218 帧两处均无图，历时约 33.3 ms。第 216 帧的聊天气泡已显示正文及「正在加载图片」。第 219 帧起图片出现，持续显示到 Bot 回复。待发区原先把后端 `ack` 当作清空信号。气泡在此期间另走 `message.image` 读取已保存的字节，再由 NSH 解码绘制。两条路径之间缺少出图反馈，造成缩略图消失后出现一段空白。 [空白原帧](screenshots/before-blank.png) · [逐帧结果](artifacts/before-frames.json)

## 修复与原生复验

输入条收到确认后保留当前会话的待发缩略图。对话区通过消息 ID 和发送请求 ID 关联气泡的各张图片，图片加载或显示重试入口时上报结果。所有图片上报后一次清空待发区。相同图片字节可以占不同位置，以图片位置独立计数。已确认的发送在切离会话时可以直接清空该会话的草稿，返回后通过历史记录显示。 [Composer](../../../../apps/desktop/ui/features/chat/Composer.tsx) · [ChatPane](../../../../apps/desktop/ui/features/chat/ChatPane.tsx) · [MessageBubble](../../../../apps/desktop/ui/features/chat/MessageBubble.tsx) · [MessageImage](../../../../apps/desktop/ui/features/chat/MessageImage.tsx) · [功能地图](../../../../references/features/chat.md)

![原生发送过渡前后帧对比](screenshots/handoff-comparison.png)

| 原生操作 | 实测结果 | 证据 |
| --- | --- | --- |
| Ctrl+V 粘贴、点击发送、等待 Bot 回复 | 复验第 220 帧气泡出图，第 222 帧待发区撤下。两处短暂同屏约 16.7 ms，交接过程采样到 0 帧空白。气泡在首次回复期间持续显示。 | [修复后录屏](artifacts/after.mp4) · [逐帧结果](artifacts/after-frames.json) · [回复后的原生截图](screenshots/after-sent.png) |
| 引用 Bot 回复、贴图、移除、再贴图、Shift+Enter | 移除时保留正文，Shift+Enter 插入换行。回复引用和待发缩略图各占一行，加号和发送按钮留在输入条底部。 | [原生驱动日志](logs/after-native.log) · [操作时间](logs/after-actions.jsonl) |
| 仅文本模型拒绝图片、切回支持图片的模型、按回车重试 | 拒绝后保留两行正文、附件与引用。协议记录匹配一次拒绝和两次成功确认，最终只有两条用户消息和两条回复。重试仍携带原附件、换行与同一个引用 ID。两次模型请求中的图片 SHA-256 等于对应的入库标识。 | [拒绝后](screenshots/after-rejected.png) · [重试后](screenshots/after-retried.png) · [协议记录](logs/after-protocol.jsonl) · [断言结果](artifacts/native-assertions.json) |
| 加号打开 GTK 图片选择器、选择 PNG、发送纯图片 | 待发区出现缩略图，发送正文为空。图片显示在气泡内并收到本地模型回复。 | [选择后](screenshots/picker-preview.png) · [发送后](screenshots/picker-sent.png) · [协议记录](logs/picker-protocol.jsonl) · [模型接收摘要](logs/picker-actions.jsonl) |
| 发送同一张图片的两个附件，隔离驱动令其中一次读图返回错误 | 发送只确认一次。另一张图照常显示，待发区清空。失败项在原位置显示「重试加载」，点击后两张都显示，模型也收到两张。 | [读图失败](screenshots/read-error.png) · [加载重试](screenshots/read-retry.png) · [协议记录](logs/read-retry-protocol.jsonl) · [模型接收摘要](logs/read-retry-actions.jsonl) |

已打开原生图片和关键帧，对照消息输入条、聊天布局与统一反馈。气泡内图片保持原比例，错误提示在顶部浮层，输入正文和缩略图仍可见。逐帧脚本按棋盘格颜色识别待发区与气泡内的图像像素。 [帧分析脚本](artifacts/analyze-frames.py)

## 检查

- `pnpm --silent verify check` 退出码 0，`ok: true`，9/9 组通过。Agent 102/102，桌面 90/90，控制 CLI 15/15，规则测试 3/3。 [全量结果](artifacts/verify-check.json) · [Agent 日志](logs/verify-agent-test.log) · [桌面日志](logs/verify-ui-test.log) · [控制 CLI 日志](logs/verify-control-test.log)
- 同实例运行 `chat-send` 和 `chat-composer --target native`，分别通过文本对话和输入框单行、折行、封顶及回缩。打开四张原生图完成看图复核。原生与全量检查日志中未发现 `unknown class`。 [文本对话](artifacts/verify-browser.json) · [原生场景](artifacts/verify-native.json) · [视觉复核](artifacts/verify-visual-review.json)
- 关联到同实例的 `verify check --run 0d923003154bedc7` 也通过 9/9。最终 `evidence report` 的 `status` 和 `visualStatus` 均为 `passed`，`failed` 和 `missing` 均为空。实例已停止，保留隔离验收数据。 [关联全量检查](artifacts/verify-check-linked.json) · [证据汇总](artifacts/verify-evidence-report.json) · [实例停止结果](artifacts/verify-stopped.json)

## 验收边界

验收覆盖 Linux GTK/X11 隔离窗口、真实 sidecar 和受控图片模型服务。Wayland、正式运行窗口和在线模型未实测。
