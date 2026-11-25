# Bot 目录与连接器改造方案（待确认）

- 日期：2026-11-12
- 状态：2026-11-13 已按本方案实现；待确认项的取舍见文末「实施结果」
- 背景参考：[OpenBot 调研](../bot-architecture-2026-11-09/01-openbot-research-zh.html)、[DSH Superagent 调研](../bot-architecture-2026-11-09/02-dsh-superagent-research-zh.html)

## 1. 要解决的问题

1. **Bot 和单一文件夹强绑定。** `Bot.cwd` 是必填字段，前台读文件、派工目录、默认范围、规矩匹配、ACP 目录校验、T3 项目查找都从它取值。个人 Bot 会在多个文件夹之间工作，这个前提不成立。
2. **「执行者」把查询和派活混在一起。** T3 只能通过 `work_start` → 开 T3 线程来使用，前台没有任何 T3 工具，「查 T3 下有哪些项目」也只能开线程或做不到。外部服务被塞进了和 Bot 自己的后台分身相同的接口。

## 2. 已确定的设计

### 2.1 Bot 的组成

**Bot = 对话层 + self。**

- **对话层**（前台）：聊天、判断、派活、验收；保持简短，长活开事项。打断策略（ERR-012）不变。
- **self**：Bot 自己的后台分身，干 Bot 亲自做的长活。不再叫「执行者」。

### 2.2 文件夹

| 类型 | 默认位置 | 说明 |
| --- | --- | --- |
| Bot 自己的 workspace | `<数据根>/bots/<botId>/workspace/` | 每个 Bot 一个，创建 Bot 时建立；和项目无关的活默认在这里做 |
| 公共文件夹 | `<数据根>/shared/` | 所有 Bot 共用 |
| 关联项目文件夹 | Bot 记住的 0~N 个路径 | 用户说「记住我的工作文件夹」，Bot 直接记下；不要求用户在界面添加 |

- `<数据根>` 默认 `~/.deepbot/`，跟随 `DEEPBOT_DATA_DIR`（ERR-008：新增运行路径必须从统一根目录派生）。
- **删除 `Bot.cwd`**，新增 `Bot.folders: string[]`。迁移：旧 `cwd` 成为第一个关联文件夹。
- **事项记录自己的目录** `Work.cwd`：和某个关联项目有关 → 该项目路径；无关 → Bot 的 workspace。Bot 有多个关联项目且判断不了时，先问用户。
- 前台的 `read_file` / `list_files` 以 Bot workspace 为当前目录；可读范围为 workspace、公共文件夹、关联文件夹与设置里的连接目录。
- 规矩的目录匹配改为匹配事项目录。

### 2.3 连接器（替代「执行者」）

所有连接器**全局接入一次，所有 Bot 共用**。按接入方式和身份分：

| 连接器 | 接入方式 | 身份 | 来源 |
| --- | --- | --- | --- |
| T3 Code | MCP | 工具型 + **派活型**（内置身份标定） | 内置 |
| 用户接入的 MCP 服务 | MCP | 仅工具型 | 用户配置 |
| 用户接入的派活服务（Hermes、Codex ACP 等） | **仅 ACP** | 派活型 | 用户配置 |

- **工具型**：工具直接调用、立即得到结果，不开事项。
- **派活型**：派出的活一律登记为事项；DeepBot 不用模型、直接轮询状态；完成后对话层验收。身份标定写明：名称与擅长什么、开活 / 查状态 / 补充 / 停止各用哪个能力、外部链接。
- **T3 只保留 MCP 接入，删除 CLI 接入**（含标题标记核对、「CLI 不能停止」提示）。停止统一用 `t3_thread_interrupt`，幂等统一用 `clientRequestId`。
- **T3 权限完全交给 T3**：删除 `weakPermissions`、「T3 必须点名或启用规矩才能派工」、「改派到 T3 须本批消息点名」。否定说法（「不要用 T3」）仍不会被当作点名选择 T3（ERR-011 的识别逻辑保留，只去掉授权门槛）。
- 派活时带上 Bot 身份：T3 线程标题、ACP 会话说明里写明是哪个 Bot、哪件事项派来的。
- T3 的开线程 / 发消息 / 停止**只走派活通道**（事项层调用），不出现在 code mode 里，保证 DeepBot 开出的每个 T3 线程都有事项跟踪。项目路径尚未登记为 T3 项目时，Bot 可调用 `t3_project_create` 登记。

### 2.4 工具调用方式：核心工具 + code mode

使用 pi-durable 1.5.0 自带的 `@earendil-works/pi-durable/codemode`（QuickJS 沙箱 `@earendil-works/pi-codemode`，已随 pi-durable 安装，需加为直接依赖）。

| | function call（模型直接看到） | code mode 内（`tools.<名字>()`，模型看不到单个定义） |
| --- | --- | --- |
| 对话层 | 现有核心工具：say / pass / react / work_* / ask / route_propose / memory_set / routine_set / current_time / read_file / list_files / web_read，外加 `codemode` | 所有连接器的工具型能力 |
| self | 现有编码工具与汇报工具，外加 `codemode` | 所有连接器的工具型能力（不含任何派活能力） |

- **MCP 桥接自己实现**（pi-durable 没有 MCP 客户端）：启动时对每个 MCP 连接器 `tools/list`，注册为 `mcp__<连接器>__<工具>`，`callers: ["tools"]`，每个连接器一个 namespace；连接改为长连接复用，不再每次调用都 initialize / DELETE。
- 接入多少 MCP 工具，模型看到的 function 数量都不变；超出提示词预算的工具由脚本用 `searchTools()` / `describeTool()` 查找。
- 前台的 code mode 脚本设较短的超时，避免占住聊天。

## 3. 影响范围

| 区域 | 文件 | 改动 |
| --- | --- | --- |
| 协议 | `packages/agent/src/protocol.ts` | `Bot.cwd` → `folders`；删除 `enabledExecutors`；`Work.cwd`；`executorId` / `ExecutorStatus` / `executor.status` 改为连接器术语；删除 `weakPermissions` |
| 账本与迁移 | `work/ledger.ts`、`runtime/app.ts` | 旧 Bot、事项、派工、规矩的数据迁移；Bot 创建时建 workspace |
| 路由与派工 | `runtime/app.ts`（`route` / `createWork` / `assign` / `reassign` / `namedExecutor`） | 去掉 T3 授权门槛；目录选择；对象改名 |
| 连接器 | `executors/` → `connectors/`：`t3code.ts`（删 CLI、改长连接）、`acp.ts`（用户配置、可多个）、`port.ts`、`support.ts`；新增 MCP 桥接；`self.ts` 移出连接器 | |
| 工具 | `bot/tools.ts`、`runtime/app.ts`（`frontAgent` / `workerAgent`） | 加 code mode；工具描述里的执行者说明 |
| 启动 | `main.ts` | 读取连接器配置，注册内置 T3 |
| 界面 | `BotConfiguration.tsx`（工作目录 → Bot 目录 + 关联文件夹）、`ExecutorSettings.tsx`（→ 连接器）、`WorkDetail.tsx`、`AttentionCard.tsx`、`RuleSettings.tsx`、`PermissionSettings.tsx`、`SettingsDialog.tsx`、`state/runtime.ts`、`state/ui.ts` | 先读 DESIGN.md 与对应 design 约束 |
| 测试 | `test/executors.test.ts`（T3 CLI 夹具 → MCP 夹具）、`test/fixtures/t3-cli.mjs`（删除）、`t3-live-smoke.ts`、`tests/runtime.test.ts`、`tests/workflows-live.ts`、`apps/desktop/tests/shell.test.tsx` | |
| 文档 | `README.md`、`apps/desktop/README.md`、`ERROR.md` 及 ERR-005 / 007 / 008 / 011 | |

## 4. 实施步骤与验证

1. **目录模型**：`folders`、`Work.cwd`、Bot workspace 与公共文件夹、数据迁移 → 验证：新建 Bot 自动建 workspace 且跟随 `DEEPBOT_DATA_DIR`；旧账本 `cwd` 迁为关联文件夹；项目相关事项用项目路径，无关事项用 Bot workspace，多项目无法判断时先提问。
2. **连接器替代执行者**：对象改名、self 移出、T3 去掉 CLI 与授权门槛、ACP 改为用户配置 → 验证：T3 MCP 夹具上派活、轮询、ready、停止、重试不重复开线程；未点名也能派给 T3；「不要用 T3」不会选中 T3；ACP 现有回归通过。
3. **MCP 桥接 + code mode**：→ 验证：夹具 MCP 服务提供 100 个工具时，对话层 function 列表数量不变；脚本可调用 MCP 工具并拿到结果；多次调用只握手一次；self 调不到 T3 派活能力；重启后进行中的脚本不重复已完成调用。
4. **界面**：Bot 目录与关联文件夹、连接器页面、事项详情 → 验证：`nsh test` 通过且无 `unknown class` 警告。
5. **整体**：`pnpm check`、`pnpm --filter @deepbot/agent test` 通过；真实 T3 MCP 上问「T3 下有哪些项目」得到列表且**不创建事项、不开 T3 线程**；用真实模型让 Bot 用 T3 完成一件小事并验收。
6. **沉淀**：更新 README、ERROR.md 及相关 error 条目。

## 5. 待确认 / 待定位

- **用户连接器的配置方式**：建议放在 `<数据根>/connectors.json`（列出用户的 MCP 与 ACP 连接器），设置页面以后再做；现有 `DEEPBOT_ACP_*` 环境变量只能配一个 ACP，不够用。
- **本机 T3 的 MCP 地址与授权方式**：待定位。目前靠 `DEEPBOT_T3_ENDPOINT` / `DEEPBOT_T3_TOKEN`；实施第 2 步时核实本机 T3 服务是否能自动发现。
- **对象改名的范围**：建议协议、账本、界面统一改为连接器术语并做迁移（ERR-005 要求两端、投影、测试一起改）；改动面较大，也可以只改界面文字、内部字段先不动。

## 6. 实施结果（2026-11-13）

- 用户连接器配置：采用 `<数据根>/connectors.json`；`DEEPBOT_T3_*` 优先于文件，旧的单个 `DEEPBOT_ACP_*` 变量仍可用。
- 本机 T3 的 MCP 地址：`http://127.0.0.1:13773/mcp`，需要 T3 的 bearer 会话凭据（`t3 auth session` 签发），放在 `DEEPBOT_T3_TOKEN` 或 `connectors.json` 的 `t3.token`。未签发凭据，真实 T3 派活未验收。
- 对象改名：协议、账本、界面统一改为连接器术语，`executorId` → `assignee`，旧账本启动时迁移（见 ERR-005）。
- 新增一条保护：T3 不再需要点名后，用户在同批消息里说了「不要用 X」的对象会被拒绝派活（见 ERR-011）。
- 验证：`pnpm check` 通过；`pnpm --filter @deepbot/agent test` 57/57；`nsh test` 54/54，无 unknown class；真实 sidecar 在隔离目录启动，T3 连接器连到本机并显示缺少凭据；Bot 配置的原生截图（320 / 240 宽）已查看，原生自动点击仍受 ERR-006 影响未通过。
