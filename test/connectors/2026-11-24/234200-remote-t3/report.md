# 远端 T3 Code 执行器验收

- 2026-11-24 23:42 起，America/Los_Angeles。Git 基线为 `e3324505148f078e06725ca8b29470865efc6eb1`，验收包含当前工作区源码。
- verify 实例为 `b0b37398556d7f86`，最终源码指纹为 `aedc1bb13054e9c9009cb7ced70a2fd29c84f3eb2e66473be9373c5ba79add9f`。原生环境为 Ubuntu 26.04.1、Node 26.13.1、NSH 0.4.0、GTK/X11、私有 Xvfb，截图 1270 × 790。桌面运行正式入口和真实 Node sidecar，连接两套隔离协议替身。
- 官方协议另用两个独立数据目录启动 T3 Code `0.1.12-nightly.20261124.5178`。两套环境有各自的环境 ID、项目、凭据和线程账本。目标服务经以测试证书受信的 HTTPS/WSS 端点访问，Codex 接入隔离的确定性模型端点。所有服务和凭据仅用于本轮测试。

## 实现与协议

「我的设置 → 连接」执行器末尾新增独立的远端 T3 Code 卡片入口。保存时验证 T3 环境、派工工具和项目查询，若填写审批凭据则验证设备会话。地址换到同一 T3 环境的新入口可以保留 DeepBot 实例 ID。连接资料写入私有 `connectors.json`，实测权限为 `0600`。远端默认逐次审批，T3 项目或环境提供默认模型。 [设置入口](../../../../apps/desktop/ui/features/settings/sections/ConnectorSettings.tsx) · [远端配置](../../../../packages/agent/src/connectors/t3-remote.ts) · [T3 官方外部接入文档](https://github.com/pingdotgg/t3code/blob/main/docs/user/outside-agents.md)

聊天派工可按执行器 ID 查询项目。事项详情改派时在所选实例上读取项目，再提交改派。每次派工、线程引用和后续操作沿用同一个实例 ID。断开后待处理的停止请求保留在原实例的队列，重连后继续。 [事项入口](../../../../apps/desktop/ui/features/bot-info/WorkDetail.tsx) · [派工与持久化](../../../../packages/agent/src/runtime/app.ts) · [T3 事项适配器](../../../../packages/agent/src/connectors/t3code.ts)

## 原生界面

| 操作 | 实际观察 | 证据 |
| --- | --- | --- |
| 从账户进入连接页，点击添加执行器 | 两列卡片齐宽，添加卡在执行器网格末尾。MCP 入口仍在连接器区。 | [入口](screenshots/native-remote-t3-01-executor-add.png) · [表单](screenshots/native-remote-t3-02-remote-editor.png) |
| 提交无效凭据，修正后添加两台 | 401 提示保留名称和地址，凭据遮蔽。修正后两张远端卡分别显示可用。 | [凭据错误](screenshots/native-remote-t3-03-invalid-credential.png) · [两台执行器](screenshots/native-remote-t3-04-two-executors.png) |
| 改名、断开、重连 | 同一张卡回显新名称。断开只改变目标卡状态，重连恢复为可用。 | [断开](screenshots/native-remote-t3-05-disconnected.png) · [重连](screenshots/native-remote-t3-06-reconnected.png) |
| 从事项详情选择办公机和项目 | 列表只返回办公机项目，提交后详情回显办公机、远端目录和执行回报。开发机和办公机分别收到 0 次和 1 次派工。 | [选项目](screenshots/native-remote-t3-07-target-project.png) · [执行回报](screenshots/native-remote-t3-08-remote-result.png) · [服务计数](artifacts/native-service-routing.json) |
| 重启原生窗口使用的隔离 sidecar | 同一数据目录读回两个执行器、编辑后的名称、原实例 ID 及原事项引用。 | [回读快照](artifacts/native-restart-snapshot.json) |
| 回归原有连接页 | 点测原有 T3 档位保存、Bot 自己设置和 MCP 授权表单。 | [原生场景日志](logs/final-legacy-ui.log) · [原有 T3 档位](screenshots/native-connectors-03-t3-mode-saved.png) |

逐张查看了 14 张原生截图。两列网格继续使用设置页既有滚动区域。一次中间运行的项目定位器将路径误解析为正则，已修正并以最终源码复验。 [视觉复核](artifacts/visual-review.json) · [最终原生场景日志](logs/final-native.log)

## 官方 T3 服务

| 操作 | 服务端及 DeepBot 结果 |
| --- | --- |
| 认证和项目发现 | 两台使用各自的 OAuth 配对，查询得到不同项目。目标另通过设备配对获得审批权限。 |
| 更新为 HTTPS 地址 | 同一个 T3 环境再次配对后保留 DeepBot 实例 ID。新地址从官方环境发现接口返回相同环境 ID。 |
| 发起审批型事项 | 只有目标服务找到该线程，另一台返回 `thread_not_found`。 |
| 重启 DeepBot 后批准 | 原线程收到批准，通过受控命令拿到验证回执。T3 运行达到 `completed`，DeepBot 进入验收中。 |
| 补发与停止 | 补发在同一线程的消息页出现，停止后 T3 返回 `interrupted` 且活动 run 清空。 |

[官方 HTTPS/WSS 业务回执](artifacts/official-t3-https.json) · [环境发现](artifacts/official-t3-descriptor.json) · [官方回环业务回执](artifacts/official-t3-loopback.json)

实际桌面验证使用私有 X11 显示。协议验证使用同一测试机上的两套独立 T3 服务和独立 TLS 端点。交付范围为源码和隔离验证。

## 全量检查与证据

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `pnpm --silent verify ui run remote-t3 --target native --run b0b37398556d7f86` | 0 | 原生流程通过，8 张截图。 |
| `pnpm --silent verify ui run connectors --target native --run b0b37398556d7f86` | 0 | 原有连接页回归通过，6 张截图。 |
| `pnpm --silent verify check --run b0b37398556d7f86` | 0 | 9 项全通过，Agent 104 项、桌面 91 项、CLI 15 项。 |
| `pnpm --silent verify evidence report --run b0b37398556d7f86` | 0 | `fresh: true`，`status: passed`，`visualStatus: passed`。 |
| `pnpm --silent verify env stop --run b0b37398556d7f86` | 0 | 验证实例已停止，证据已归档。 |

[全量检查](artifacts/verify-check.json) · [证据报告](artifacts/verify-evidence.json) · [Agent 测试](logs/agent-test.log) · [桌面测试](logs/ui-test.log) · [CLI 测试](logs/control-test.log)
