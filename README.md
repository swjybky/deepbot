# deepbot
一款简洁的个人 bot 应用

## 架构

```
apps/desktop      NSH (Native Shell) 桌面端：App.tsx + ui/（界面，QuickJS）+ src/（Rust 原生模块）
packages/agent    Agent sidecar：Pi Durable（@earendil-works/pi-durable）运行在 Node 上，SQLite 持久化
apps/mobile       移动端（规划中）
design/           现行界面约束（入口：DESIGN.md）
```

界面的目录分层、设计 token 和组件约束见 [DESIGN.md](DESIGN.md)。

NSH 的 TSX 运行在 QuickJS 上，而 Pi Durable 需要 Node，所以 agent 作为 sidecar 进程运行：
桌面端的 Rust 模块 `Agent`（`apps/desktop/src/sidecar.rs`）负责启动它，双方通过 stdin/stdout 上的
JSON-lines 通信，协议定义见 `packages/agent/src/protocol.ts`。会话、事项、派工、审批、规矩、记忆和例行保存在
`~/.deepbot/session.sqlite`；每个 Bot 一条前台线，长工作由独立后台会话执行。
进程中断后恢复持久任务；同一数据目录只允许一个 sidecar 写入。DeepBot 自身产生的数据统一放在 `~/.deepbot/`：会话数据库、`connectors/` 派活记录（旧版本的 `executors/` 启动时自动改名）、`connectors.json` 连接器配置、`bots/<Bot>/workspace/` 每个 Bot 的工作区、`shared/` 所有 Bot 共用的公共文件夹、`models.json` 模型配置、`config.json` 初始配置、`tools/` 工具、`cache/` 缓存和 `tmp/` 命令临时目录。命令临时目录执行结束后清理；项目文件夹里的任务产物仍保存在项目文件夹。

首次启动会将旧 `~/.local/share/deepbot/` 和 `~/.config/deepbot/` 的内容迁入新目录，保留旧路径为兼容符号链接；迁移要求先退出使用旧目录的进程，同名文件冲突时停止且不覆盖。SQLite 的 WAL/SHM 与数据库一起移动，保留已有会话。显式设置其它 `DEEPBOT_DATA_DIR` 时，配置、执行记录、工具和临时目录也跟随该目录，且不导入用户原有数据。

## 开发

依赖：Node ≥ 24、pnpm、Rust（由 `rust-toolchain.toml` 固定版本）、[nsh](https://nsh.dev) CLI，
Linux 上还需要 GTK 4.14+ 和 WebKitGTK 6.0：

```bash
sudo apt install libgtk-4-dev libwebkitgtk-6.0-dev clang fonts-noto-cjk
```

一键启动（检查依赖、按需 `pnpm install`、启动桌面端）：

```bash
./start.sh            # 本机运行
```

或者手动：

```bash
pnpm install
export ANTHROPIC_API_KEY=...        # 可选；已登录本机 Codex 时可直接复用其登录态
pnpm dev                            # nsh run apps/desktop
pnpm --silent verify check           # 全量 lint、类型检查和离线测试，输出 JSON
pnpm test                           # 后端集成/权限/连接器测试 + NSH 界面测试
```

也可以用 `pnpm --silent check` 执行同一检查。新克隆后运行 `git config --local core.hooksPath .githooks`，提交前会在隔离环境检查暂存区。

## 打包与发布

Linux、Windows 和 macOS 的按需远程打包、验证和发布步骤见[发布指南](docs/release.md)。

## 个人 Bot（架构第一部分 M0–M3）

- 消息先落库再显示；连发合并，忙时插话；允许 `say` 多条回复和 `pass` 静默。多个 Bot 的常驻单聊互相隔离。
- 一个 Bot 由对话层和后台分身 self 组成。对话层负责聊天、判断、派活和验收，保持简短；长工作开成事项，交给 self 或派活连接器（内置的 T3 Code、用户接入的 ACP），并在聊天里用自己的话回执。事项不进聊天，在右侧「动态」里点开查看目标、验收标准、派活对象、目录、进度和产物，可以停止或改派。回复带事项的消息先交给 Bot，由它转达、改派、停止或重新打开已结束的事项。派活对象报告完成后，Bot 核对证据并验收，再用自己的话回答原来的目标。self 的工具调用与实际输出可供验收分页读取。
- self 使用 Pi 的 coding agent 工具（read、write、edit、bash），并配备 `explore` 只读探索子代理与 `handoff` 跨阶段上下文重置工具，直接在本机的事项目录里运行，可以联网、安装依赖、跑测试和 Git；需要你决定或动手的事由 Bot 用提问卡片问你。「设置 → 执行器」配置 self 的思考等级、上下文窗口（按窗口自适应比例自动压缩）、图片输入，以及是否读取全局（`~/.deepbot/AGENTS.md`）与项目目录层级的 AGENTS.md / CLAUDE.md 和 `SKILL.md` 渐进式技能索引（`~/.deepbot/skills/` 与项目 `.deepbot/skills/`、`.claude/skills/`、`.agents/skills/`）；self 没有工具轮数上限。已结束事项追问重开时优先复用原 self 会话保留上下文与缓存，运行中的工具、重试与压缩状态会同步投影到事项进度。
- Bot 不绑定单一目录：每个 Bot 有自己的工作区，所有 Bot 共用一个公共文件夹；你让 Bot 记住工作文件夹，它就把它加入关联文件夹（右侧「配置」里也能添加、移除）。和某个关联文件夹有关的事项在那里做，和项目无关的在 Bot 的工作区里做。
- 连接器所有 Bot 共用。它们的工具通过 Pi 的 code mode 调用：模型只看到一个 `codemode` 工具，写脚本调用 `tools.<名字>()`，接入再多工具，模型的函数列表也不变；对话层的核心工具仍是普通函数调用。查 T3 的项目、读线程这类查询直接调用，不开事项。
- 聊天提出规矩后必须确认才生效；设置中可以编辑/关闭。用户为当前事项点名时优先按点名派活。多条已启用规矩同时匹配时，使用最近确认或保存的一条。essential 记忆保留来源消息。例行触发事项，关掉应用期间不运行，重新启动后补跑到期事件一次。

self 在事项目录里干活；Bot 验收时只读事项目录、Bot 的工作区和关联文件夹、公共文件夹，以及「设置 → 这台电脑」里连接的目录。界面只展示后端状态，没有模拟回复或模拟任务进度。

### 模型配置

在「设置 → 模型」中按提供方展开模型列表，添加、编辑配置并设为默认。选择提供方会预填 API 类型和地址，支持拉取模型 ID 或手动填写；测试连接使用未保存草稿且不修改当前配置，点击保存才统一生效，取消丢弃草稿。每份配置使用 Pi 的模型注册与调用 API，可设置提供方、模型 ID、API 类型、服务地址和密钥。新建 Bot 默认选中当前默认模型，也可选择其他配置；「设置 → Bot」可以切换已有 Bot 的模型。更改默认模型不改变已有 Bot 的选择，更改一份配置会应用于引用它的 Bot（正在运行时需先结束当前调用或事项）。self 也使用 Bot 选中的配置；T3 / ACP 的外部模型仍由对应连接器自己管理。

模型配置与默认选择写在 `~/.deepbot/models.json`，文件权限为 `0600`；API Key 不进入协议快照或会话账本，留空编辑密钥时保留原值。已有 Bot 的提供方与模型会自动迁移为配置引用，保留会话。模型文件跟随统一用户数据目录；通过 `DEEPBOT_DATA_DIR` 隔离启动时，使用该目录下独立的 `models.json`。

首次没有模型文件时，导入显式环境变量、仓库未跟踪的 `.env` / `.env.local` 或 `~/.deepbot/config.json`（从旧配置目录自动迁入），优先级依次递减；创建模型文件后，以设置页写入的配置为准，启动变量不会覆盖已保存的模型选择。初始导入支持：

```bash
DEEPBOT_PROVIDER=openai-codex             # 或 anthropic / openai / 自定义名称
DEEPBOT_MODEL=模型名称
DEEPBOT_BASE_URL=https://服务地址/v1        # 自定义服务可选
DEEPBOT_API=openai-responses              # 或 openai-completions / anthropic-messages
DEEPBOT_API_KEY=...                       # 只放私有配置，不能提交
# 以下是启动环境变量，通过 shell 导出
export DEEPBOT_DATA_DIR=/绝对路径/隔离数据目录
```

未显式配置时，优先使用已有 Anthropic/OpenAI API 环境变量；否则只读复用 `~/.codex/auth.json` 的本机登录，默认 `openai-codex / gpt-6.1-terra`。不复制、刷新或写回登录凭据；登录过期时在 Codex 中重新登录。模型凭据不会进入协议快照和账本。

### 连接

「我的设置 → 连接」统一管理执行器和 MCP 连接器。执行器包括 Bot 自己的后台偏好、T3 Code、Codex ACP 及其他已配置 ACP。

T3 Code 默认使用本机 `http://127.0.0.1:13773/mcp`。在「连接 → 执行器 → T3 Code → 配置连接」配置新派工权限和凭据。

- **派活连接**接受 T3 Code 的 Sharing & access 配对链接、配对码或 MCP 密钥。新派工默认「完全访问」。普通配对链接按所选档位申请，带访问级别的 MCP 码沿用该级别。已配对的低权限连接需要重新授权才能使用完全访问。
- **审批连接**使用另一个设备配对链接或审批密钥。DeepBot 只申请 `orchestration:read` 和 `orchestration:operate`，并只读写自己派出的事项中的活跃审批。两个配对码各使用一次。本机局域网链接可通过本机回环地址完成配对。

连接成功后，会话密钥保存到当前数据目录的 `connectors.json`（0600），连接即时生效。留空的凭据字段保留已保存值。内置 T3 Code 卡片仍支持 `DEEPBOT_T3_TOKEN`、配置文件的 `t3.token` 和 `DEEPBOT_T3_ENDPOINT`，以桌面保存的密钥优先。

从「添加执行器」连接另一台 T3 Code 时，派活支持 HTTPS 和可信局域网的 HTTP 私有 IP（RFC 1918 IPv4 或 IPv6 ULA）。HTTP 会明文传输派活配对数据和 MCP 凭据。审批连接选填，使用 HTTPS/WSS 或本机回环，派活可独立使用。使用另一台电脑的局域网地址前，需要在对方的 T3 Code 中开启[网络访问](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md#pair-over-a-lan-or-private-network)。

T3 Code 的查询工具进 code mode。开线程、补充、停止和回传请求只走派活，DeepBot 开出的每个 T3 线程都登记为事项。T3 的结构化问题在原聊天中答复，配对审批连接后可直接批准或拒绝。Bot 对能核实的工作区内常规操作单次代批，记录在事项详情。用户明确要求本人审批的事项使用「逐次审批」，收到的权限请求由用户决定。T3 和所选提供方决定实际可用的运行模式和发出的请求。

派给 T3 无需点名。你说了「不要用 T3」的那批消息不会派给它。事项目录要先登记为 T3 项目，Bot 可以用 T3 的 `t3_project_create` 登记。可配置 `DEEPBOT_T3_PROVIDER` 和 `DEEPBOT_T3_MODEL`。本机 Codex 模型模式默认使用 T3 的 `codex` 提供者。

用「连接 → 添加连接器」添加 Streamable HTTP MCP，并选择可使用工具的已有 Bot。新建 Bot 的默认授权可独立设置。连接日志与界面快照只展示状态和授权。已有 HTTP、stdio 和 ACP 配置仍可从私有 `connectors.json` 读取：

```json
{
  "t3": { "url": "http://127.0.0.1:13773/mcp", "token": "..." },
  "mcp": [
    { "id": "github", "name": "GitHub", "url": "https://example.com/mcp", "headers": { "authorization": "Bearer ..." } },
    { "id": "files", "name": "本地文件", "command": "npx", "args": ["some-mcp-server"] }
  ],
  "acp": [{ "id": "hermes", "name": "Hermes", "command": "hermes", "args": ["acp"] }]
}
```

环境变量优先于文件里的 `t3`。原来的单个 ACP 变量 `DEEPBOT_ACP_COMMAND`、`DEEPBOT_ACP_ARGS`（JSON 字符串数组）、`DEEPBOT_ACP_ID`、`DEEPBOT_ACP_MODE` 仍然可用。普通 MCP 启动时探测工具，也可以在「管理」里断开和重连。存量 MCP 升级时保留已有 Bot 的访问，新建默认关闭。可安装已验证的官方 Codex ACP：

```bash
./scripts/install-codex-acp.sh
```

安装在个人数据目录，没有配置别的 ACP 时，重启后自动发现为 `acp:codex`。ACP 使用需要批准的模式，单次审批转入会话卡片；不支持恢复的会话带交接包重新派工。不会用绕过审批的模式启动。改派会等待原来的工作真正结束，避免两方同时改现场。

### 权限与恢复边界

self 的 `write` / `edit` 工具受 `beforeTool` 钩子校验：当本地文件权限关闭或目标路径不在允许目录（事项目录、Bot 工作区/关联文件夹、公共文件夹、已连接文件夹、命令临时目录）内时直接拦截；`bash` 仍以当前用户身份在本机自由运行以支持装包、构建和 Git，其余权限开关写入派工要求，由它自觉遵守。Bot 前台的验收读取工具在调用时读取实际设置，文件路径按真实路径校验，只能读上面列出的目录。

T3 自己执行运行模式控制，DeepBot 在代批前校验当前事项、实际动作和目录。ACP 对权限请求逐次校验，不能判定动作范围的通用命令拒绝放行，应使用专用文件工具或交给 self。

中断的读操作可恢复，写入/命令等未知副作用不会盲目重放；模型收到中断结果后先检查现场。关闭桌面会关闭 sidecar，本部分不提供后台常在线、群聊、外部 IM 或多台电脑。

### 真实运行验收

Agent 从 `pnpm --silent verify --help` 进入控制 CLI，按 [功能地图](references/features/README.md) 选择场景。CLI 在隔离环境启动后端、操作界面并采集证据。用法见 [控制 CLI](tools/control/README.md)。

验证流程、原生截图对比与交付要求见 [verify 技能](skills/verify/SKILL.md)，历史与本次验证资料统一在 [test/](test/README.md) 按功能和日期归档。

本次实施结果与真实运行证据见 [M0–M3 验收报告](test/mvp/2026-11-10/report.md)。

自动测试不需要联网；以下命令使用实际已配置模型和连接器，会生成隔离临时工作目录和验收记录：

```bash
pnpm --filter @deepbot/agent test:live       # 真对话、后台 Python、文件校验、负责人交付
pnpm --filter @deepbot/agent test:restart    # 模型/命令运行中 SIGKILL，重启恢复与幂等
pnpm --filter @deepbot/agent test:workflows  # T3、规矩、例行、发布审批与 ACP
```

## 开源协议

本项目采用 [Apache License 2.0](LICENSE) 开源协议。

Copyright 2026 swjybky
