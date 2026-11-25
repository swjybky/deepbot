# T3 派工权限与请求回传验证

- 时间与时区：2026-11-19 00:45–01:00，America/Los_Angeles
- 代码：`e3324505148f078e06725ca8b29470865efc6eb1` 上的工作区，含本轮连接器、Agent 协议、聊天卡片、设置和测试改动
- 环境：Ubuntu 26.04.1，NSH 0.4.0 `e626a8d`，Node 26.13.1，T3 Code 0.1.11 Nightly 20261117.4825，Codex `gpt-6.2-sol`
- 界面：GTK 原生 1280×800，Wayland 为本机默认后端，另做 X11 对照
- 数据：合成卡片用于复现旧显示，真实业务使用隔离 DeepBot 数据和隔离 T3 服务。原窗口只验证配对授权、连接和数据读回

## 复现与预期

1. 旧配对在 `approval-required` 下派工。等待状态及数量变化曾产生四条相同提醒。
2. 新配对使用完全访问。新派工显式指定执行模式，普通读命令应直接完成。
3. 在聊天里回答 T3 的结构化问题或提交审批决定，原卡片应随 T3 回执更新。旧卡片和重试均不能重复执行。
4. Bot 只代批能核实的当前事项内操作。明确要求用户审批的任务保留人工决定。

## 代码检查

| 命令 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `pnpm check` | 0 | 通过 | [类型与原生编译](logs/check.log) |
| `pnpm --filter @deepbot/agent test` | 0 / 80 | 通过 | [后端回归](logs/backend.log) |
| `nsh test apps/desktop` | 0 / 85 | 通过 | [桌面回归](logs/headless-final.log) |
| `nsh test apps/desktop --target linux --filter 'T3 requests render real choices'` | 0 / 1 | Wayland 选择、提交和拒绝通过 | [原生 Fixture](logs/native-pointer-away-wayland.log) |
| `nsh test apps/desktop/App.tsx --target linux` | 0 / 2 次各 1 项 | Wayland 正式 App、真实 sidecar 和 T3 | [答复和拒绝](logs/native-live-retry.log)、[批准](logs/native-live-approve.log) |

日志中无 `unknown class`。

## 原生截图与实际对比

| 检查项 | 参照 | 本次实际截图 | 实际查看结果 | 结论 |
| --- | --- | --- | --- | --- |
| 重复等待卡 | [四张通用卡](screenshots/01-before.png) | [结构化审批与多题表单](screenshots/02-requests.png) | 同尺寸原生 Fixture。每条请求一张卡，审批动作和决定可见，多题在同一卡内完整显示 | 通过 |
| 多题已答、审批已拒绝 | [选择前](screenshots/02-requests.png) | [已处理](screenshots/03-answered.png) | 选择值在原卡显示，按 Bot 颜色标出，输入条和聊天宽度稳定 | 通过 |
| 连接状态 | 旧配对仅显示可用 | [连接器状态](screenshots/04-connection.png) | 原生 Fixture 显示完全访问和审批已连接 | 通过 |
| 正式 App 真实请求 | [点选前](screenshots/05-live-requests.png) | [答复和拒绝之后](screenshots/06-live-answered.png)、[包含批准的重启读回](screenshots/07-live-approved.png) | 原始问题、具体命令和审批原因可见。点击 BLUE、批准或拒绝后，各自保留一个决定 | 通过 |

已打开原图。基线和多题图使用合成数据，正式 App 两张图来自真实 T3 结构化请求。两组图分别比较，不在报告中存放用户的历史聊天截图。

## 真实业务

| 操作 | 实际结果 | 证据 | 结论 |
| --- | --- | --- | --- |
| 普通派工 | T3 实际 `full-access`，`git status --short` 执行完成，无审批 | [真实提供方](logs/live-provider-first.log) | 通过 |
| 批准 | 正式 App 点批准后，T3 请求成为 `resolved/accept`，目标命令退出码 0 | [真实提供方](logs/live-provider-first.log)、[正式 App 回写](logs/native-approved-result.log) | 通过 |
| 拒绝 | T3 请求成为 `resolved/decline`，目标命令取消 | [真实提供方](logs/live-provider-first.log)、[正式 App 回写](logs/native-remote-results.log) | 通过 |
| 普通提问 | T3 原请求收到 BLUE 并继续生成最终答复 | [真实提供方](logs/live-auto-question.log)、[正式 App 回写](logs/native-remote-results.log) | 通过 |
| Bot 单次代批 | `git status --short` 在逐次审批模式收到单次 `accept` 并完成，未弹手工审批卡 | [代批与问题](logs/live-auto-question.log) | 通过 |
| 现有连接切换 | 从实际 `approval-required` 上限升级到 `full-access`，独立审批连接可用，真实项目查询成功。新桌面后台读回这两个状态 | [配对状态](logs/live-connection.log)、[后台读回](logs/live-sidecar.log) | 通过 |

## 失败与范围

- 初轮 X11 和 Wayland 原生注入点击出现未提交。Wayland 在移出真实鼠标后复测通过，正式 App 验收同样在默认 Wayland 完成。X11 注入交互仍未验收。保留 [X11 首轮](logs/native-t3.log)、[Wayland 首轮](logs/native-wayland-cards.log) 和 [正式 App 首轮](logs/native-live.log)。
- 最初的命令断言把 T3 自己的工作区准备事件也算入被拒绝的命令。按同一原生工具项核对后，目标命令为 `cancelled`，无退出码，见 [远端核对](logs/native-remote-results.log)。
- 首次批准后的截图为空帧。重启隔离 App 后，原审批卡读回「批准」，已打开并核对 [截图](screenshots/07-live-approved.png)。
- 切换运行中的空闲后台时，原窗口重连未响应。尝试通过原生界面控制时触发窗口关闭，随后用原数据目录重新打开，核对 4 个 Bot、94 条消息和 9 个事项计数相同。
- 真实执行验收仅覆盖本机 T3 Nightly 的 Codex 提供方。原数据窗口用于授权和运行状态核对，具体测试行为在隔离环境完成。

## 最终结论

代码检查、默认 Wayland 原生显示与操作、本机连接授权、隔离真实 T3 运行和回写通过。对话中展示正式 App [收到请求](screenshots/05-live-requests.png) 和 [处理结果](screenshots/07-live-approved.png)。
