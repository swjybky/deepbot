# Bot 回复菜单验证记录

- 2026-11-24 17:37–17:41 PST。代码基于 `e332450` 与当前工作树。验收源码指纹为 `d77e71011e090f364f4bd154127133b469ffaddb993382272b851d4fd7b0cb2c`。
- Ubuntu 26.04.1 LTS、Linux 7.0.0-43-generic、Node 26.13.1、NSH 0.4.0（e626a8d）。GTK 使用 verify 的私有 Xvfb。鼠标验收窗口为 1280×800，verify 场景截取 1270×790 的内容区。
- verify 实例 `114270160ec9b977` 使用独立 SQLite、真实 Node sidecar 与本地模型替身。原生场景和真实鼠标验收在同一 verify 实例中使用各自的测试数据库。
- 实现见 [消息气泡](../../../../apps/desktop/ui/features/chat/MessageBubble.tsx)、[图标表](../../../../apps/desktop/ui/theme/icons.ts)、[界面回归](../../../../apps/desktop/tests/shell.test.tsx)、[对话区设计](../../../../design/layout.md)和[聊天功能地图](../../../../references/features/chat.md)。

## 原生交互与截图

从正式 `App.tsx` 打开小菜会话，发送隔离测试文本，等 Bot 返回 `DEEPBOT_VERIFY_OK`。用同一私有显示上的 `xdotool` 实际悬停、点击和粘贴。截图已打开核对。

| 操作 | 实际结果 | 截图 |
| --- | --- | --- |
| 悬停 Bot 气泡 | 气泡右侧出现回复箭头和三点，两个按钮同行。悬停前后气泡范围像素差为 0。 | [悬停前](screenshots/idle.png)、[悬停后](screenshots/buttons.png) |
| 点击三点 | GTK 的独立弹层显示「复制」，鼠标移入菜单项后有高亮。使用 `xwininfo` 找到弹层，再由 `xwd -id` 单独截取原生弹层。 | [复制菜单](screenshots/copy-menu.png)、[菜单项悬停](screenshots/copy-menu-hover.png) |
| 点「复制」 | 顶部显示绿色「成功：已复制回复」。`xclip` 读回正文，Ctrl+V 将同一文本粘贴进输入框，随后清除测试草稿。 | [成功反馈](screenshots/success.png)、[输入框粘贴](screenshots/paste.png) |
| 引用 Bot 回复及取消 | 输入框上方显示对应引用，点「取消引用」后引用条消失。 | [引用](screenshots/bot-reply.png)、[取消后](screenshots/cancel.png) |
| 引用用户消息及取消 | 气泡左侧的回复按钮正常添加引用，点击取消后输入框恢复。 | [引用](screenshots/user-reply.png)、[取消后](screenshots/user-cancel.png) |
| 侧栏右键回归 | 原生场景从侧栏右键菜单打开重命名表单，回车保存后读到测试名称。 | [重命名表单](screenshots/cli-sidebar-rename.png) |

`xclip -selection clipboard -t UTF8_STRING -out` 退出码 0，读到 17 字节。先用 `cmp` 比对本地模型固定输出，再只读查询原生测试库，确认实际保存的 Bot 消息与剪贴板内容一致。数据见 [逐字节比对](artifacts/clipboard-match.json)和[剪贴板原文](artifacts/system-clipboard.txt)，操作见 [X11 日志](logs/x11-actions.log)。

## 命令结果

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm --silent verify ui run chat-send --target native --run 114270160ec9b977` | 退出码 0，原生场景 1/1，输入、发送和 Bot 回复通过。 | [日志](logs/chat-send.log)、[输入](screenshots/cli-typed.png)、[回复](screenshots/cli-replied.png) |
| `pnpm --silent verify ui run sidebar-context --target native --run 114270160ec9b977` | 退出码 0，原生场景 1/1。 | [日志](logs/sidebar-context.log) |
| `nsh test --target linux App.tsx` | 补充原生驱动用例 1/1，覆盖菜单取消、反馈关闭及双方引用和取消。 | [日志](logs/nsh-actions.log) |
| `pnpm --silent verify check` | 退出码 0，`ok: true`，9 项均为 `passed`。Agent 91/91、桌面 85/85、控制 CLI 15/15。 | [完整 JSON](artifacts/check.json) |
| `pnpm --silent verify evidence report --run 114270160ec9b977` | 同一实例的场景、视觉复核和检查汇总见报告。 | [汇总 JSON](artifacts/evidence-report.json) |

桌面回归还验证了在两条 Bot 回复中选择指定条目时，复制结果保留 Markdown 标记、换行和中文。首次使用 NSH 测试驱动点选菜单时，外部 X11 剪贴板读不到内容。随后在 verify 私有显示中用普通 GTK 开发宿主实点并完成读回和粘贴。隔离原生场景覆盖 Linux X11。Wayland、在线模型、用户现有窗口和系统剪贴板写入失败分支未实测。
