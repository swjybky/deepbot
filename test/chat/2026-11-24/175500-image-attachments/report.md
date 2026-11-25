# 聊天图片验证记录

- 2026-11-24 17:51–18:04 PST。基线 Git `e332450` 与当前工作树，验收源码指纹 `2557858944d9657b37343c20a0dec5686ab4464916a6d2f84b3ea2ebed2b1ba0`。
- Ubuntu 26.04.1 LTS、Linux 7.0.0-43-generic、Node 26.13.1、NSH 0.4.0（e626a8d）。真实 GTK 应用运行在私有 Xvfb，窗口 1280×800。verify 场景截取 1270×790 内容区。
- verify 实例 `e063a90ef7882820`。图片实操复用该实例的隔离配置和源码，使用独立的原生 SQLite 和真实 Node sidecar。前台使用内置模型目录中支持图像的 `gpt-4o` 配置，接收端是隔离网络里的 OpenAI 兼容 HTTP 测试服务。

## 原因与实现

任务按 feature 剧本处理。原输入框通过 NSH 单行输入接收文本和系统文本粘贴。DeepBot 没有注册图片粘贴、文件选择或文件拖入。Linux 的 GTK 宿主原本已能从剪贴板取出位图并转成 PNG，应用层没有消费该事件。旧的 `message.send`、消息记录、前台队列和气泡都只有文本。macOS、Windows 使用同一套 DeepBot 输入框与平台原生 NSH 宿主，改动前的应用层缺口相同。接收端的 pi-durable 支持图片内容块，T3 派工连接器的补发入口走文本。

这次补上 [输入框和缩略图](../../../../apps/desktop/ui/features/chat/Composer.tsx)、[消息气泡](../../../../apps/desktop/ui/features/chat/MessageBubble.tsx)、[协议类型](../../../../packages/agent/src/protocol.ts)、[图片校验与存储](../../../../packages/agent/src/runtime/chat-images.ts) 和 [队列到模型的内容映射](../../../../packages/agent/src/runtime/app.ts)。文件入口采用系统图片选择器。图片发送使用独立命令，旧 sidecar 能明确拒绝并保留草稿。当前 Bot 的模型须声明支持图像。纯文本和能力未知的模型在写入消息前提示切换。已有对话可直接读取，图片随原请求编号幂等重发。

首轮 GTK 实操中，只声明 `image/png` 的 X11 剪贴板暴露出原生默认文本粘贴会把图片字节插进正文。补丁在有粘贴监听且剪贴板只提供图片时抑制这次文本插入。最终实操中 PNG 缩略图出现，正文保持空白，普通文本仍按系统行为替换选区。 [GTK 输入补丁](../../../../vendor/nsh-platform-linux/src/text_input.rs)

## 原生交互与截图

从正式 `App.tsx` 打开小菜私聊。用 `xclip` 提供实际 X11 剪贴板内容、`xdotool` 发系统组合键和鼠标事件、`xwd` 截取应用和系统对话框。已逐图查看，与 [输入条](../../../../design/components/input.md)、[消息气泡](../../../../design/layout.md) 和 [统一反馈](../../../../design/components/feedback.md) 比对。

| 操作 | 实际观察 | 证据 |
| --- | --- | --- |
| Ctrl+V 粘贴 PNG | 2560×1440 样图按比例显示为缩略图，输入条原高度保留，正文为空，发送可用。 | [粘贴前](screenshots/01-before.png)、[粘贴后](screenshots/02-pasted.png) |
| 移除，再粘贴并按回车 | 点右上角移除，缩略图消失且发送禁用。再次粘贴后回车，纯图片出现在右侧气泡，模型返回 `IMAGE_RECEIVED`。 | [移除](screenshots/03-removed.png)、[发送](screenshots/04-sent.png) |
| 从系统选择器选 JPEG | 系统选择器打开本地文件，选中 JPEG 后出现对应预览。悬停 Bot 回复并点击回复，添加引用后配正文发送。 | [选择器](screenshots/05-picker.png)、[JPEG 缩略图](screenshots/06-picked.png)、[引用和文字](screenshots/07-quote-and-caption.png)、[发送后](screenshots/08-jpeg-sent.png) |
| 选取超过 6 MiB 的文件 | 顶部出现大小限制和缩小后重试提示，输入条可继续使用。协议记录没有多出的发送。 | [失败提示](screenshots/09-oversize-feedback.png) |
| 纯文本 Ctrl+V 与回车 | Ctrl+A 选中的文字被新内容完整替换。回车发送后收到 `TEXT_RECEIVED`。 | [替换选区](screenshots/10-text-pasted.png)、[纯文本回复](screenshots/11-text-sent.png) |
| 退出应用并使用同一数据重开 | PNG、JPEG、文字与回复仍能读回。展开信息栏后，图片和输入条保持在聊天列内，顶部胶囊仍浮在滚动内容上。 | [重开后](screenshots/12-after-restart.png)、[信息栏展开](screenshots/13-narrow-chat.png) |

## 协议与模型接收

真实 sidecar 接收两条图片消息和一条纯文本消息。首条正文为空，第二条保留配文和引用编号。PNG 缩小到 2000×1125，JPEG 保留 620×400。两张图片的 SQLite 元数据摘要、落盘文件、前台模型 HTTP 请求的 `image_url` 及消息气泡读回摘要全部匹配。两次启动中，每张图片分别只读取一次，本地模型替身按实际请求体是否含图片返回对应结果。 [结构化断言](artifacts/image-round-trip.json)、[协议记录](artifacts/native-protocol.jsonl)、[模型接收摘要](artifacts/model-received.jsonl)

## 检查

| 命令 | 结果与证据 |
| --- | --- |
| `pnpm --silent verify ui run chat-send --target native --run e063a90ef7882820` | 退出码 0，1/1。文本输入、按钮发送及 Bot 回复通过。 [原生场景日志](logs/verify-chat-native.log)、[输入](screenshots/verify-01-typed.png)、[回复](screenshots/verify-02-replied.png) |
| `pnpm --silent verify check --run e063a90ef7882820` | 退出码 0，9/9 通过。Agent 98/98、桌面 85/85、控制 CLI 15/15。 [检查 JSON](artifacts/verify-check.json)、[Agent](logs/agent-test.log)、[桌面](logs/ui-test.log)、[控制 CLI](logs/control-test.log) |
| `pnpm --silent verify evidence report --run e063a90ef7882820` | `status: passed`，原生截图复核通过。 [证据汇总](artifacts/verify-evidence-report.json) |
| 原生补充 GTK 实操 | [启动与动作](logs/gtk-actions.log)、[应用运行日志](logs/gtk-app.log) |

## 验证范围

实际验收覆盖 Linux GTK X11、PNG 剪贴板、JPEG 选择、失败反馈、文本快捷键、引用、真实 sidecar 和隔离模型 HTTP 请求。Wayland、macOS、Windows 和在线模型识图未实测。T3/ACP 派工走独立的任务协议。用户当前窗口须完整重启以加载同一版本的界面和 sidecar。

现有 verify 场景没有系统剪贴板图片动作。可以为原生场景加一个写入测试图片并触发粘贴的步骤，让这次的组合键复测直接出现在 CLI 报告中。
