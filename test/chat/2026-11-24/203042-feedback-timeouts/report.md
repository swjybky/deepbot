# 桌面临时提示自动关闭验证

- 时间与环境为 2026-11-24 20:30–20:38 PST。Ubuntu 26.04.1 LTS、Linux 7.0.0-43-generic、GTK 4.22.4、NSH 0.4.0（e626a8d）、Node 26.13.1。使用私有 Xvfb 上的 GTK X11 窗口，窗口 1280×800，原生截图为 1270×790。
- verify 实例为 `21899a6390224ac0`。Git 基线为 `e332450`，含工作区改动。修改前源码指纹为 `5ceffec74a935d3ea369bb4452e21d8a47fd5867b2e59f7f821a8808948eabb7`，修复后为 `d7f312191569829a0a6bbd2587e2a12b376541d24af707a86b66429674ac667d`。正式 `App.tsx` 连接真实 Node sidecar、隔离 SQLite 和本地模型替身。
- 原因是共用 `notify()` 为警告和错误传入了永久时长。沿用成功 4 秒和信息 5 秒，首次给警告设为 6 秒、错误设为 8 秒。继续使用 NSH `ToastManager` 对每条提示计时，同一 ID 的替换项由管理器重新计时。 [共用实现](../../../../apps/desktop/ui/state/feedback.ts) · [设计约定](../../../../design/components/feedback.md) · [聊天功能地图](../../../../references/features/chat.md)

## 原生复现与复验

在小菜私聊粘贴样图并点击发送。当前测试模型的图片能力无法自动识别，sidecar 拒绝发送并返回错误。模型设置用默认模型的删除保护触发警告，用不可达的隔离地址触发连接测试错误。设置测试停在编辑草稿内。

| 场景 | 实际观察 | 证据 |
| --- | --- | --- |
| 修改前发图被拦截 | 错误显示后 10.116 秒仍在。待发图片可见，点击关闭后提示消失。 | [显示时](screenshots/feedback-baseline-01-shown.png)、[10 秒后](screenshots/feedback-baseline-02-still-shown.png)、[日志](logs/feedback-baseline.log) |
| 修复后连续发图被拦截 | 第一条错误仍在时重试，界面存在两条提示。第一条在约 8.49 秒时退出，第二条仍显示。检测到第二条后 7.4 秒仍可见，随后自动退出。图片草稿和原有对话仍可见。 | [首次显示](screenshots/feedback-fixed-01-chat-shown.png)、[重试仍显示](screenshots/feedback-fixed-02-chat-retry-survives.png)、[自动关闭后](screenshots/feedback-fixed-03-chat-cleared.png)、[日志](logs/feedback-fixed-chat.log) |
| 手动关闭 | 再次发送后点「关闭提示」，约 0.42 秒后提示完成退场，待发图片还在。 | [日志](logs/feedback-fixed-chat.log) |
| 共用警告和错误 | 模型设置里的警告约 6.48 秒退出，连接错误约 8.50 秒退出。自动关闭后编辑器和未保存的地址均保留。 | [警告](screenshots/feedback-fixed-04-warning-shown.png)、[错误](screenshots/feedback-fixed-05-settings-error-shown.png)、[错误退出](screenshots/feedback-fixed-06-settings-error-cleared.png)、[日志](logs/feedback-fixed-settings.log) |

逐张打开截图，对照设计核对顶部居中、语义颜色、长错误换行、关闭按钮和正文位置。聊天的首次提示原图与基线像素一致。关闭后顶部浮层消失，聊天气泡、附件缩略图和输入条的位置保持一致。设置内的浮层显示在弹窗内容之上。观察值包含进退场和窗口取样误差，代码中的时长是提示进入后的计时参数。

只读查询修改前后的隔离 SQLite，两次都保存了同一条正常文本及其 Bot 回复，图片附件入库数均为零。 [聊天记录摘要](artifacts/chat-ledger-summary.json)

## 检查与产物

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm --silent verify ui run chat-send --target native --run 21899a6390224ac0` | 退出码 0，1/1。文本输入、发送和回复通过。 | [场景结果](artifacts/verify-chat-native.json)、[日志](logs/verify-chat-native.log)、[输入](screenshots/verify-01-typed.png)、[回复](screenshots/verify-02-replied.png)、[原图复核](artifacts/verify-visual-review.json) |
| 隔离实例下的 `nsh test --target linux App.tsx` | 修复前复现、修复后聊天、修复后设置各为退出码 0。 | [复现步骤](artifacts/feedback-baseline.js)、[聊天步骤](artifacts/feedback-fixed-chat.js)、[设置步骤](artifacts/feedback-fixed-settings.js)、[样图](artifacts/feedback-input.png) |
| `pnpm --silent verify check --run 21899a6390224ac0` | 退出码 0，9/9 通过。Agent 99/99、桌面 89/89、控制 CLI 15/15。 | [全量检查](artifacts/verify-check.json)、[Agent 日志](logs/agent-test.log)、[桌面日志](logs/ui-test.log)、[控制 CLI 日志](logs/control-test.log) |
| `pnpm --silent verify evidence report --run 21899a6390224ac0` | 退出码 0，`status: passed`，原生截图复核通过。 | [证据汇总](artifacts/verify-evidence-report.json) |
| `pnpm --silent verify env stop --run 21899a6390224ac0` | 退出码 0，隔离实例已停止。 | [停止结果](artifacts/verify-stop.json) |

桌面回归使用 NSH 手动时钟检查四级时长，以及同一 ID 替换后跨过旧截止时间继续显示。关闭按钮、Esc 和悬停暂停由已有回归覆盖。 [桌面回归](../../../../apps/desktop/tests/shell.test.tsx#L631)

发图复现使用 NSH 原生测试宿主的文件粘贴动作，分聊天和设置两段覆盖 6 秒、8 秒与连续提示。合跑时触及 NSH 单场景 30 秒上限，随后分段退出码均为 0。若要把补充实操纳入 verify 场景，现有步骤语法需增加粘贴图片和可指定时限的可见性断言。 [首次合跑日志](logs/feedback-combined-timeout.log)

## 验收范围

本轮实际窗口覆盖 Linux GTK X11 上的发图拒绝和模型设置反馈。本次验收数据为独立测试数据，当前用户窗口及 Wayland、macOS、Windows 的加载与行为未核验。
