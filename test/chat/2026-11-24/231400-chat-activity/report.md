# 聊天运行状态验收

2026-11-24 晚，PST。验证实例 `b9eab7d426d439f7` 使用 Ubuntu 26.04.1 LTS x86_64、NSH 0.4.0（e626a8d）和私有 GTK/X11 窗口（1270×790）。验证从桌面应用入口启动真实 Node sidecar，使用隔离 SQLite 和本地模型替身。

代码基于 `e332450` 的工作区源码快照，指纹为 `11d12648eb601692e2442d5be25eba8c0bf063b1314fe5950be502a5a168b67c`。并行的连接管理改动更新了共享工作区指纹，最终验证固定在同一次复制的源码上。冻结副本首次使用依赖链接时，pnpm 重写了原工作区的模块链接，随后按锁文件离线恢复，最终验证使用独立依赖副本。 [隔离环境](artifacts/env-start.json)

## 实现

Agent 从当前会话的 `LiveDoc` 投影运行状态。活跃工具和同一轮刚完成的工具结果驱动「正在使用工具」或「正在安排事项」。后者只用于创建和改派事项的工具轮次。正常模型处理显示「正在思考」，收到流式正文后显示「正在组织回复」，排队、重试和旧 sidecar 回退使用「正在处理」。工具结果的保留窗口为 900 毫秒，当前轮结束时清空。桌面按当前会话读取状态，文案刷新沿用消息列末尾的三点动画和 Bot 颜色。 [Agent 投影](../../../../packages/agent/src/runtime/app.ts) · [桌面接入](../../../../apps/desktop/ui/features/chat/ChatPane.tsx) · [布局约束](../../../../design/layout.md)

## 原生操作与截图

| 操作 | 观察结果 | 截图 |
| --- | --- | --- |
| 发送阶段验证消息 | 等待模型首个事件时显示「正在思考」 | [01 思考](screenshots/01-thinking.png) |
| 模型发出网页读取调用 | 真实 Agent 读取沙箱内测试网页，显示「正在使用工具」 | [02 工具](screenshots/02-tool.png) |
| 工具运行时切到隔离助手，再切回小菜 | 隔离助手为空闲，切回小菜恢复工具状态 | [03 切到空闲 Bot](screenshots/03-other-idle.png) · [04 切回](screenshots/04-back-to-tool.png) |
| 两次网页读取后创建事项 | 事项回执到达，显示「正在安排事项」 | [05 派发事项](screenshots/05-dispatch.png) |
| 模型开始流式生成正文 | 显示「正在组织回复」，随后出现回复并收起动画 | [06 组织回复](screenshots/06-replying.png) |
| 回复结束后打开「动态」 | 聊天动画已收起，事项仍显示执行中 | [07 回复结束、后台继续](screenshots/07-replied-background-running.png) |
| 发一条令模型返回 HTTP 400 的验证消息 | 显示错误提示，聊天动画收起 | [08 失败后收起](screenshots/08-failed-idle.png) |
| 从新开原生窗口发送普通消息 | 输入、按钮发送、回复和结束状态均正常 | [09 普通消息](screenshots/09-ordinary-typed.png) · [10 普通回复](screenshots/10-ordinary-replied.png) |

复核原图中的状态文字、圆点颜色和位置，并核对切 Bot 后的头部、输入框及聊天末尾。第一轮原生试跑以无障碍标签定位普通 Bot 行失败，改用项目已有的侧栏范围和文本定位后通过。

## 后端与检查

两次连续工具调用之间的快照保持在工具状态。原生 SQLite 通过只读查询核对两条成功的 `web_read` 和一条成功的 `work_start` 结果。真实 Agent 回归另验证了取消当前轮后 `sync` 的状态为空，以及新消息打断旧回复后只有新回复投影到聊天。 [协议状态序列](artifacts/activity-timeline.json) · [原生工具结果](artifacts/native-tool-results.json) · [Agent 测试日志](logs/agent-test.log)

| 命令 | 退出码与结果 | 证据 |
| --- | --- | --- |
| `verify api call message.send`、`verify api snapshot` | 均为 0。最终聊天状态为空，回复已入库，后台事项仍在执行 | [发送确认](artifacts/send-ack.json) · [快照](artifacts/snapshot.json) |
| `verify ui run chat-activity --target native` 和 `verify ui run chat-send --target native` | 均为 0。两个场景通过，未出现未知样式类 | [阶段场景](logs/native-chat-activity.log) · [普通聊天](logs/native-chat-send.log) |
| `pnpm --silent verify check --run b9eab7d426d439f7` | 0，9/9。Agent 103/103、桌面 91/91、CLI 15/15、规则 3/3 | [全量结果](artifacts/check.json) · [桌面测试日志](logs/ui-test.log) |
| `verify evidence review-save` 和 `verify evidence report` | 均为 0。复核 10 张原图，`status` 和 `visualStatus` 均为 `passed` | [视觉复核](artifacts/visual-review.json) · [证据报告](artifacts/evidence-report.json) |
| `verify env stop` | 0。验证实例已停止 | [停止结果](artifacts/env-stop.json) |

并行的图片输入栏排版在冻结之后继续调整。工作区的聊天状态代码与验收副本逐文件一致，工作区另复跑了状态测试 3/3 和协议状态下的发送测试 1/1。

## 结论

隔离原生窗口的交互和视觉复核、真实 Agent 工具执行、状态投影及全量检查均通过。

在线模型、外部 T3 或 ACP 执行器和正式安装窗口未纳入验收。
