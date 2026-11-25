# T3 派活规矩优先级验证

- 时间为 2026-11-19 00:09 起，America/Los_Angeles（PST，UTC−08:00）。验证人为 Codex。
- 目标是当同一个事项目录命中两条已确认的派活规矩时，按最近确认或保存的一条执行，并保留当前用户点名的优先级。
- Git 基线为 `e3324505148f078e06725ca8b29470865efc6eb1`，含原有未提交改动。本轮运行代码差异为 `packages/agent/src/runtime/app.ts`，回归新增于 `packages/agent/tests/runtime.test.ts`。
- Ubuntu 26.04.1 LTS，Node 26.13.1，NSH 0.4.0（e626a8d）。原生对照使用独立 Xephyr 的 GTK X11，通过 NSH 驱动输入和截图。窗口 1280×800，截图 1270×790，缩放 1，Noto Sans CJK SC。
- 前后分别使用独立数据目录和相同结构的临时项目。原生对比使用正式 App、正式 Node sidecar 和本机确定性模型 HTTP 服务。另用本机 Magpie 网关的 `deepseek/deepseek-flash` 验证模型到派工的后端链路。两组均用本机 T3 MCP 测试服务。

## 复现与预期

1. 原始事项的账本只读核对显示，两条已确认、已启用的规矩都匹配目标和目录，旧 `self` 规矩在前。创建时 T3 有效，派工记录为 `self`。见 [脱敏账本读数](logs/original-work.log)。
2. 隔离 sidecar 通过协议保存匹配范围相同的旧 `self` 规矩和新 `t3code` 规矩。打开原生 App，在聊天框提交「行，用他再跑一遍」。确定性测试模型调用 `work_start`，传入 `assignee: "t3code"`。从 Bot 动态打开「复查项目 README」事项。
3. 预期原生详情显示「T3 Code」，账本只有一次 `t3code` 派工，测试 MCP 只收到一次启动请求。
4. 后端回归还覆盖聊天确认卡片、当轮点名 `self`、禁用新规矩及重新保存旧规矩。点名和来源消息匹配另有既有回归。

## 代码检查

| 命令 / 工作目录 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| 修复前路由回归 | 1 / 1 | 复现，实际 `self` | [旧版](logs/before.log) |
| `node --test --test-name-pattern='latest confirmed rule|naming an executor|keyword routing' packages/agent/tests/runtime.test.ts` | 0 / 3 | 通过 | [新版](logs/after.log) |
| `pnpm check` | 0 | 通过 | [检查日志](logs/check.log) |
| `pnpm --filter @deepbot/agent test` | 0 / 75 | 通过 | [后端日志](logs/agent.log) |
| `nsh test apps/desktop` | 0 / 83 | 通过 | [headless 日志](logs/headless.log) |
| `nsh test apps/desktop/App.tsx --target linux` | 前后各 0 / 1 | 原生入口和派工投影对比通过 | [旧版](logs/native-before.log)、[新版](logs/native-after.log) |

测试日志中 `unknown class` 警告为 0。

## 原生截图与实际对比

| 检查项与位置 | 参照/修改前图片 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 「执行 → 派活对象」 | [修复前](screenshots/01-before.png) | [修复后](screenshots/02-after.png) | 标签和选框由「Bot 自己」统一变为「T3 Code」，文字完整，目录和进度布局无挤压 | 通过 |
| 「进度」与「产物」 | [修复前](screenshots/01-before.png) | [修复后](screenshots/02-after.png) | 修复后展示测试服务返回的中文结果和「执行结果」条目 | 通过 |

已打开两张原图。前后使用相同视口与输入操作。实际提交聊天及打开事项详情通过，路由写入隔离 SQLite 账本。无动画变更。

## 真实业务与产物

| 操作/输入 | 预期 | 实际结果 | 后端证据/产物及校验值 | 结论 |
| --- | --- | --- | --- | --- |
| 从原生聊天发起重跑 | T3 派工一次 | 修复前为 `self` 且 T3 调用 0 次，修复后为 `t3code` 且收到一次 MCP 启动 | [派工记录和启动次数](logs/native-after.log) | 隔离业务通过 |
| 真实模型按重叠规矩派活 | 明确按新规矩读取临时项目 README，派工一次 | DeepSeek 经正式 sidecar 创建一条 `t3code` 派工，MCP 测试服务收到一次启动 | [真实模型测试](logs/live-model.log) | 隔离业务通过 |
| 本机实际 T3 服务执行复查 | 创建实际 T3 线程并核对产物 | 测试使用合成输入和隔离 MCP 服务 | — | 未验证 |

## 失败、未验证项与复验

- 原窗口仍连接改动前启动的 Node。重新打开 DeepBot 后才会加载新路由。原始事项已结束，历史账本仅做只读核对。
- 实际服务复验可在新版后台用获准的只读测试任务，观察事项详情显示 T3 Code，并核对对应 T3 线程及其产物。
- 关联 [ERR-016](../../../../error/dispatch-rule-precedence.md)。

## 最终结论

代码、隔离原生入口和真实模型的派工验证通过，实际 T3 服务执行与原窗口更新待验证。

对话展示 [修复后的派活对象](screenshots/02-after.png)。
