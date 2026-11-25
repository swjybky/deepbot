# 图片放入消息输入框的验证记录

- 2026-11-24 23:19 PST 开始。Git 基线 `e332450` 加工作树。最终验收用隔离实例 `adf2671af85430a5`，源码指纹 `9834d2dbc6197fa2faf4591eb88ed8b346664bffc47cd4ff7e14eaffbbb6b471`。 [隔离实例](artifacts/verify-start.json)
- Ubuntu 26.04.1 LTS、NSH 0.4.0（`e626a8d`）、私有 Xvfb 的 GTK/X11 原生窗口。用程序生成的 PNG、独立数据库、真实 Node sidecar 和本地图片模型服务。

## 界面调整

缩略图、正文和两侧操作共用一个圆角描边。待发缩略图缩为 56pt，保持图片比例并保留移除按钮。有图时正文占满可用宽度，加号和发送键单独在底部两端。最后一张图移除或发送成功后，输入框恢复为正文与按钮同排。网格改变行列位置时复用同一个原生编辑器。按钮沿用 DeepBot 的形状、文案和 Bot 配色。 [Composer.tsx](../../../../apps/desktop/ui/features/chat/Composer.tsx) · [输入框规范](../../../../design/components/input.md) · [聊天功能地图](../../../../references/features/chat.md)

## 原生截图与检查

首轮截图发现网格整体底对齐时，文本外框增高后正文仍只显示一行。最终版让文本区在网格内纵向展开，两侧按钮独立贴底。短句、软换行、封顶和发送后回缩的四张原生图均已打开核对，长正文可见并完整进入气泡。 [短句](screenshots/verify-01-short.png) · [换行](screenshots/verify-02-wrapped.png) · [封顶](screenshots/verify-03-capped.png) · [回缩](screenshots/verify-04-sent.png) · [原生场景](artifacts/verify-native.json)

以相同的输入框区域逐像素对照上轮四张纯文本验收图，短句、换行、封顶和回缩四种状态的差异像素均为 0。 [上轮原生对照](../230013-image-send-flicker/report.md)

浏览器 `chat-send` 完成后用 `verify api snapshot` 检查，真实 sidecar 保存了「你好，验证一下」和 `DEEPBOT_VERIFY_OK`。 [浏览器场景](artifacts/verify-browser.json) · [快照](artifacts/verify-snapshot.json)

| 原生操作 | 结果 | 证据 |
| --- | --- | --- |
| Ctrl+V 粘贴图片并继续打字，再粘贴两张 | 光标保留，可继续输入。三张图与正文位于同一描边内。 | [输入框局部](screenshots/input-detail.png) · [三图](screenshots/three-images.png) |
| 打开信息栏并把窗口缩至 560px | 缩略图以两张加一张换行，正文同步折行，按钮仍在底部两端。恢复宽窗后逐一移除，原草稿保留且输入框回缩。 | [窄窗](screenshots/narrow.png) · [移除后](screenshots/removed-all.png) · [文本送达](screenshots/text-replied.png) · [原生驱动日志](logs/image-layout-native.log) |
| 点击加号，用 GTK 文件选择器选图并直接发送 | 输入框内显示待发缩略图和占位文字。真实 sidecar 收到一张图和空正文，收到模型回复后气泡仍显示图片。 | [选择后](screenshots/picker-preview.png) · [纯图发送](screenshots/picker-sent.png) · [协议事件](logs/picker-protocol.jsonl) |
| 点击发送，观察到 Bot 回复 | 图片进入聊天气泡，输入框恢复一行。约 120 fps 录制的首次交接采样到 0 帧空白。 | [发送后](screenshots/image-sent.png) · [录屏](artifacts/image-send.mp4) · [帧分析](artifacts/image-send-frames.json) |
| 带引用发图被仅文本模型拒绝，切回图片模型后用回车重试 | 正文两行、图片及引用完整保留。被拒绝与重试的请求正文、附件和引用 ID 一致。两次成功请求的图片摘要与入库标识一致。 | [拒绝后](screenshots/image-rejected.png) · [重试后](screenshots/image-retried.png) · [协议事件](logs/image-send-protocol.jsonl) · [原生断言](artifacts/native-assertions.json) |

## 全量检查

`pnpm --silent verify check --run adf2671af85430a5` 退出码 0，9/9 组通过。Agent 103/103，桌面 91/91，CLI 15/15。首轮客户端在输出全量通过结果后触发工具时限，最终用独立进程复跑并确认退出码。最终证据报告与视觉复核均为 `passed`，隔离实例已停止。 [全量检查](artifacts/verify-check.json) · [桌面日志](logs/verify-ui-test.log) · [证据报告](artifacts/verify-evidence-report.json) · [停止结果](artifacts/verify-stopped.json)

视觉与键盘验收覆盖隔离 Linux GTK/X11。Wayland 和正式窗口未实测。
