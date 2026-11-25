# 连接

## 1. 功能说明

「我的设置 → 连接」以两列卡片集中显示执行器和连接器。Bot 自己、T3 Code、Codex ACP 及已有 ACP 执行器对所有 Bot 可用，派活仍取决于连接状态、执行器能力和原有审批流程。

普通 MCP 提供工具。每个服务单独授权给已有 Bot。空名单有效。「新建 Bot 默认可用」开启时，后续创建的 Bot 会加入该服务的名单。关闭开关后，已经加入名单的 Bot 继续按名单授权。

## 2. 用户路径

1. 点左侧栏底部账户行「deepbot」（`id:sidebar-account`），再点「连接」（`id:settings-connections`）。
2. 点「Bot 自己」卡片的「配置」（`id:self-configure`），卡片铺满一行并展开思考等级、上下文窗口、图片输入和项目说明。改动即时保存，后台事项从下一次模型请求起使用新值。
3. T3 Code 卡片显示新派工档位、T3 已授权档位的差异以及审批连接状态。点「配置连接」（`id:t3-configure`）展开整行表单，可选新派工权限、填派活及审批连接凭据。凭据留空继续使用已有值。连接失败会保留草稿。Codex ACP 在派活时进行实际握手。
4. 点「执行器」末尾的「添加执行器」（`id:executor-add`），填写远端 T3 Code 名称、环境或 MCP 地址、派活配对凭据，以及选填的审批设备凭据。校验通过后显示独立卡片。「管理」可改名、更新地址或凭据、断开和重连。
5. 点「连接器」网格末尾的「添加连接器」卡片（`id:mcp-add`）。无服务时点「暂无连接器」卡片。整页表单可填名称、Streamable HTTP 地址及可选 Bearer 令牌，在「已有 Bot」勾选或取消授权，独立选择新建默认值。添加成功后回到卡片网格。
6. 服务卡片显示连接状态、工具数量和可用 Bot 数量。点卡片底部的「管理」可编辑名单及默认值，也可断开或重连。断开会保留配置及授权，重连按保存的名单生效。已有 stdio 服务可管理授权和连接状态，进程参数从本地配置读取。

## 3. 前后端对应

- **覆盖** 界面 `settings:connections`；接口 `connector.t3.configure`、`connector.t3.save`、`connector.t3.connect`、`connector.t3.projects`、`connector.mcp.save`、`connector.mcp.connect`

| 层 | 位置 |
| --- | --- |
| 界面 | [ConnectorSettings.tsx](../../apps/desktop/ui/features/settings/sections/ConnectorSettings.tsx) 的执行器及连接器卡片网格，[McpEditor.tsx](../../apps/desktop/ui/features/settings/sections/McpEditor.tsx) 的 MCP 草稿表单 |
| 协议 | `connector.mcp.save` 提交 `name`、`access: {botIds, allowNewBots}`，可带 `connectorId`（编辑）、`url`、`token`。添加必须带 URL。编辑时 URL 和令牌省略则沿用同一地址的凭据，空令牌移除 Authorization。 `connector.mcp.connect` 按 `connectorId`、`enabled` 断开或重连 |
| 远端执行器 | [RemoteT3Editor.tsx](../../apps/desktop/ui/features/settings/sections/RemoteT3Editor.tsx) 提交 `connector.t3.save`，`connector.t3.connect` 按实例 ID 开关。 [t3-remote.ts](../../packages/agent/src/connectors/t3-remote.ts) 验证同一 T3 环境并在私有配置持久化。 |
| 数据 | [config.ts](../../packages/agent/src/connectors/config.ts) 在私有 `connectors.json` 保留旧 MCP、T3、ACP 配置，写入 MCP 候选配置。 [managed-mcp.ts](../../packages/agent/src/connectors/managed-mcp.ts) 在 `deepbot.ledger` 原子提交生效版本、授权与连接开关。快照 `connectors[].mcp` 只投影授权、传输方式、开关和凭据有无 |
| 运行时 | [runtime/app.ts](../../packages/agent/src/runtime/app.ts) 在前台与后台 code mode 生成工具目录前按 Bot 筛选；[mcp-tools.ts](../../packages/agent/src/connectors/mcp-tools.ts) 在每次实际发送及重试前查当前会话、授权及连接版本 |

## 4. 用 verify CLI 怎么驱动

```bash
pnpm --silent verify ui run connectors --target native --run "$R"
pnpm --silent verify api snapshot --run "$R"
pnpm --silent verify ui run mcp-management --target native --run "$R"
pnpm --silent verify ui run remote-t3 --target native --run "$R"
pnpm --silent verify ui run remote-t3-lan --target native --run "$R"
```

`connectors` 覆盖统一入口、T3 档位、Bot 自己的执行偏好及 MCP 授权表单。`mcp-management` 需要在本轮 verify 的独立网络命名空间启动 [本地 MCP 测试服务](../../packages/agent/test/fixtures/managed-mcp.ts) 的 23115 端口。MCP 管理写入由原生场景驱动，verify 的 `api call` 策略仅允许 T3 档位的写入。全量 `verify check` 内的 Agent 测试覆盖前台、后台、升级、调用撤权和重启。

`remote-t3` 需要在同一隔离网络启动 [T3 MCP 测试服务](../../packages/agent/test/fixtures/t3-mcp.mjs)，分别监听 23116 和 23117，第二台使用项目目录 `/isolated/office`。

`remote-t3-lan` 需要在隔离私网的非回环地址 `10.77.0.2:23118` 启动同一测试服务，项目目录为 `/isolated/lan-project`。场景检查明文提示、审批凭据的传输限制、留空审批后的保存、项目发现和改派。

## 5. 注意事项

- 远端 T3 派活连接支持 HTTPS、本机回环 HTTP，以及直接输入 RFC 1918 IPv4 或 IPv6 ULA 地址的私网 HTTP。HTTP 会明文传输派活配对数据和 MCP 凭据，请只在可信私网使用。所有 HTTP 请求拒绝重定向，连接前核对环境 ID。改地址需要新地址的凭据，且环境 ID 必须一致。切换电脑时添加独立执行器。新事项使用目标 T3 项目或环境配置的默认模型。
- 审批连接使用单独的设备凭据，只支持 HTTPS 和本机回环。留空即可仅连接派活。在原地址编辑时留空会保留已保存的审批凭据。需要设备审批的操作仍由用户决定。
- 断开保留配置和事项绑定。随后重连原实例可继续读取进度和处理请求。配置快照只显示地址、档位、连接状态和审批凭据有无。

- 存量 MCP 首次迁移时保留全部已有 Bot（包括隐藏 Bot）的访问权，后续新建默认关闭。创建 Bot 与其默认授权在同一事务中写入。
- HTTP MCP 接受 HTTPS 和本机 HTTP。添加或替换已启用服务的连接参数时，候选配置握手并读取工具目录成功后才生效。只修改授权可在服务离线时保存。
- 断开和撤权阻止再次调用。已经送达服务的请求等待真实结果。运行中的脚本可能持有启动时的目录，实际发送仍查当前授权和生效版本。
- 已获授权的 Bot 使用连接器凭据调用远端工具。具体操作权限由服务决定。
- 配置中的执行器独占一行，卡片会重新分组。T3 草稿和请求状态由网格外的组件持有，确保卡片换行时仍能继续编辑。
- 标准隔离窗口没有真实外部 T3 及 Codex ACP，保存 T3 档位和显示 ACP 状态由原生场景验证，握手、派活和审批回归见 [连接器测试](../../packages/agent/test/connectors.test.ts) 和 [事项](work.md)。
