# 统一连接与 MCP 授权验收

- 最终原生操作和重启验证时间为 2026-11-24 22:53（UTC−08:00），全量检查随场景运行。同轮实例为 `ac12cef18e4b12ce`。
- Git 基线为 `e3324505148f078e06725ca8b29470865efc6eb1`，工作树源码指纹为 `7126d1f65e71467222666342e4c805ea054a02b67a4fa280429e879c9e79332f`。同期事项界面更新后重新进行了两套原生操作、重启和全量检查，11 张原生图摘要与实际看过的图片逐一一致。
- Ubuntu 26.04.1、Node 26.13.1、NSH 0.4.0（e626a8d）。原生场景使用 GTK/X11、私有 Xvfb 显示和正式 `App.tsx` 入口，截图为 1270×790。
- Bubblewrap 实例独立持久化数据库。原生窗口运行真实 Node sidecar，模型与 MCP 服务在同一隔离网络用本地测试服务。

## 原生操作与视觉核对

实际打开了全部 11 张原生图。左栏两处入口收为「连接」，执行器状态与 MCP 管理保持 DeepBot 的描边列表样式。 [变更前同尺寸原生截图](../../../feature-map/2026-11-23/173745-acceptance-fixes/screenshots/native-connectors-01-connectors.png)

| 操作 | 可观察结果 | 证据 |
| --- | --- | --- |
| 打开我的设置并进入「连接」 | 左栏一个入口。右栏按执行器和连接器分组，三种执行器和 MCP 空态可见 | [概览](screenshots/connectors-01-connectors.png) |
| 配置 T3 Code，取消后重新打开并选逐次审批 | 派活和审批凭据字段均保留，留空保存；目录回显新档位。原生 SQLite 留下档位及自有执行器设置 | [表单](screenshots/connectors-02-t3-editor.png) · [保存](screenshots/connectors-03-t3-mode-saved.png) · [保存读回](artifacts/native-executors.json) |
| 展开 Bot 自己并修改思考等级 | 「思考等级」选中高，其他三个偏好可见 | [本机执行偏好](screenshots/connectors-04-self.png) |
| 添加 MCP，选择已有 Bot 和新建默认值 | 初始空名单及关状态，选择小菜后名称出现，默认值独立切换 | [初始表单](screenshots/connectors-05-mcp-editor.png) · [授权](screenshots/mcp-management-02-grant.png) |
| 输入不可用地址后保存 | 服务返回 404，顶部报告错误，名称和地址保留，改正确后可保存 | [错误状态](screenshots/mcp-management-01-failed-address.png) · [操作日志](logs/mcp-native.log) |
| 添加两项、清空验收甲名单、断开并重连 | 两个服务可同时在线及分别管理。断开只影响验收甲，重连恢复一项工具并保留空授权 | [两项在线](screenshots/mcp-management-03-two-services.png) · [断开](screenshots/mcp-management-04-disconnected.png) · [重连](screenshots/mcp-management-05-reconnected.png) |

## 服务端验证

| 检查项 | 实际结果 | 证据 |
| --- | --- | --- |
| 原生应用添加、重连真实 HTTP 测试服务 | 本地服务按顺序收到 `/alpha`、`/beta`、`/alpha` 三次有效握手 | [服务请求日志](logs/mcp-fixture.jsonl) |
| 使用原生窗口保存的数据重启真实 sidecar | SQLite 的两项服务全在线，空名单与新建默认关闭均已保存。重启后的同路径 sidecar 发出 `ready` 和 `snapshot`，两项各有一件工具，ID 和空授权保持一致 | [重启前](artifacts/native-before-restart.json) · [重启后](artifacts/native-after-restart.json) · [启动时的 MCP 握手](logs/mcp-restart-fixture.jsonl) |
| 升级已有数据和创建 Bot | 已有 HTTP、stdio 保留原有 Bot 和隐藏 Bot 的授权。后续创建默认关闭，开启后新建获得授权，关闭后先前获得的授权仍在。再次重启空名单保持为空 | [运行时回归](../../../../packages/agent/tests/runtime.test.ts#L864) · [Agent 测试日志](logs/agent-test.log) |
| 前台及后台分身发现和调用 | 授权的两端均查询到目录并取得本地 HTTP 的工具返回；未授权的两端查不到目录，按名称指定也到不了服务 | [Agent 测试日志](logs/agent-test.log) |
| 调用中撤权或断开，候选地址无效 | 已送出的调用收到响应。同一旧脚本的新调用被拒绝，服务端调用计数保持不变。候选地址失败后此前连接和授权仍有效，Bearer 保持在私有配置文件中 | [Agent 测试日志](logs/agent-test.log) |
| T3 与 ACP 回归 | T3 档位 API 返回 ack 并可由快照读回。离线协议测试覆盖 T3 配对、派活与审批，以及 ACP 会话、派活与逐次审批 | [T3 回执](artifacts/t3-api.json) · [协议快照](artifacts/api-snapshot.json) · [Agent 测试日志](logs/agent-test.log) |

MCP 测试服务通过 `nsenter --user --net` 加入本轮 verify 的网络命名空间，在 23115 端口运行 [fixture](../../../../packages/agent/test/fixtures/managed-mcp.ts)。重启验证另外在同一实例的挂载、网络与进程命名空间运行正式 sidecar，使用窗口生成的独立数据目录，通过 JSON-lines `sync` 读取公开快照。

## 检查结果

- `pnpm --silent verify ui run connectors --target native --run ac12cef18e4b12ce` 退出 0。 [结果](artifacts/connections-native.json) · [操作日志](logs/connections-native.log)
- `pnpm --silent verify ui run mcp-management --target native --run ac12cef18e4b12ce` 退出 0。 [结果](artifacts/mcp-native.json) · [操作日志](logs/mcp-native.log)
- `pnpm --silent verify api call connector.t3.configure` 和 `api snapshot` 均在同轮退出 0。
- `pnpm --silent verify evidence review-input --run ac12cef18e4b12ce` 退出 0，归档图片与返回摘要逐一核对。 [复核输入](artifacts/review-input.json)
- `pnpm --silent verify check --run ac12cef18e4b12ce` 退出 0，9 项全通过。Agent 101/101、桌面 90/90、CLI 15/15。 [全量结果](artifacts/full-check.json) · [桌面日志](logs/ui-test.log) · [CLI 日志](logs/control-test.log)
- `evidence review-save` 和 `evidence report` 均退出 0。报告状态及视觉复核均为 `passed`，`fresh: true`。 [复核回执](artifacts/review-save.json) · [证据报告](artifacts/evidence-report.json)

## 验证边界

测试全程使用隔离数据。真实外部 T3 实例和正式 Codex ACP 客户端未接入，T3 配对、审批与 ACP 派活的证据来自本地协议回归。本轮使用既有的远端 HTTPS 约束，本机 HTTP 用回环地址验证。
