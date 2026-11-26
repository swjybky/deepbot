# 启动、数据与重连

## 1. 功能说明

桌面应用启动时，由 Rust 拉起 Node 后端（sidecar），两边通过 JSON-lines 通信：

1. 后端打开数据目录里的 SQLite，发出 `ready`，再发出第一份 `snapshot`。
2. 界面收到快照后才算「已连接」，这时可以发消息。
3. 之后每条写命令都带 `requestId`，后端用 `ack` 或 `error` 回应。
4. 状态变化通过快照或增量事件推送给界面。

后端退出后，界面显示「重连」按钮；重连时会重发没有确认的命令。同一个数据目录只允许一个后端写入。

## 2. 用户路径

1. 从正式入口启动：在仓库根目录执行 [start.sh](../../start.sh)，它会打开 [App.tsx](../../apps/desktop/App.tsx)，窗口为 1280×800，标题栏隐藏。
2. 连接期间，对话区显示「正在连接本机服务」，发送按钮不可用。
3. 收到快照后，侧栏出现 Bot。默认选中「小菜」，数据为空时后端会自动创建它。
4. 后端断开时，头部右上角出现「重连」按钮（`id:agent-reconnect`），同时弹出「本机服务已退出，请重新连接」之类的错误提示。点「重连」后，界面先发 `sync`，再重发还没收到确认的命令。
5. 「电脑」设置页和动态页里显示「本机服务已连接」或「未连接」。

发布版按[发布指南](../../docs/release.md)下载并安装，在应用菜单或「应用程序」中打开。打包入口从安装位置解析随包的 Node 和 Agent。

## 3. 前后端对应

- **覆盖** 接口 `sync`

| 层 | 位置 |
| --- | --- |
| 打包与发布 | [GitHub 工作流](../../.github/workflows/release.yml) 和[打包脚本](../../scripts/release/package.mjs)核对安装包、包内 Agent 协议和原生启动。 |
| 入口 | [start.sh](../../start.sh) → [App.tsx](../../apps/desktop/App.tsx) → [AppShell.tsx](../../apps/desktop/ui/AppShell.tsx)（调用 `connectAgent()`） |
| 传输 | `startAgent()` 负责启动、`sync` 和处理断线。待确认的命令以原始 JSON 行重发，并沿用初次提交的 `requestId`。 [services/agent.ts](../../apps/desktop/ui/services/agent.ts) · [Rust 宿主](../../apps/desktop/src/sidecar.rs) |
| 前端状态 | `runtime()` 提供只读快照，`requestStatus()` 查询请求状态，`command()` 提交协议命令。 [state/runtime.ts](../../apps/desktop/ui/state/runtime.ts) |
| 后端 | [main.ts](../../packages/agent/src/main.ts) 是 JSON-lines 入口；[runtime/app.ts](../../packages/agent/src/runtime/app.ts) 负责启动、迁移、发出 `ready` 和 `publish()`；[runtime/data-directory.ts](../../packages/agent/src/runtime/data-directory.ts) 处理数据目录和 `agent.lock` 单写者锁 |
| 协议 | [protocol.ts](../../packages/agent/src/protocol.ts)：命令为 `Command`，事件为 `EventPayload`，包括 `ready`、`snapshot`、`thread.delta`、`work.updated`、`attention.opened`、`attention.resolved`、`ack`、`error`、`fatal`、`model.result` |
| 数据访问 | `storage/session.ts` 打开 SQLite，对上提供持久会话存储接口。Agent 运行时通过领域操作读写账本。 [storage/session.ts](../../packages/agent/src/storage/session.ts) |
| 数据 | 数据根由 `DEEPBOT_DATA_DIR` 指定，默认为 `~/.deepbot`；CLI 沙箱里是 `/data/agent`。具体内容：<br>`<根>/session.sqlite`：pi-durable 的表 `documents`、`conversations`、`entries`、`tasks` 等，`deepbot.ledger` 文档就存在这里<br>`<根>/models.json`<br>`<根>/connectors.json`<br>`<根>/bots/<id>/workspace`<br>`<根>/shared`<br>`<根>/agent.lock` |

## 4. 用 verify CLI 怎么驱动

```bash
R=$(pnpm --silent verify env start | node -pe 'JSON.parse(require("fs").readFileSync(0)).runId')

pnpm --silent verify env status --run "$R"                    # ready、backendGeneration、sourceVersion、fresh
pnpm --silent verify api snapshot --run "$R"                  # 就是发一条 sync，数据在 result.event.snapshot
printf '{}' | pnpm --silent verify api call sync --run "$R"   # 等价写法
pnpm --silent verify logs read --source agent --tail 50 --run "$R"     # 后端 stderr
pnpm --silent verify logs read --source protocol --tail 50 --run "$R"  # 全部协议事件

# 重启后端，数据保留：先造数据，重启，再读回
printf '%s' '{"bot":{"id":"verify-bot","name":"验证 Bot"}}' | pnpm --silent verify api call bot.upsert --run "$R"
pnpm --silent verify env restart --scope all --run "$R"       # backendGeneration 会变
pnpm --silent verify api snapshot --run "$R"                  # verify-bot 仍在

# 后端停掉时的报错：AGENT_NOT_READY，退出码 3，nextAction 指向 env restart
pnpm --silent verify env stop --run "$R"
printf '{}' | pnpm --silent verify api call sync --run "$R"
pnpm --silent verify env restart --scope all --run "$R"

# 正式入口（Rust 宿主拉起 sidecar）：原生场景就是从 App.tsx 启动的
pnpm --silent verify ui run chat-send --target native --run "$R"

pnpm --silent verify env stop --run "$R"   # 用完停止实例。不再需要数据时，按验证技能「收尾」一步删除
```

## 5. 注意事项

- **CLI 实例和正式应用是两套数据。** CLI 的数据在 `/var/tmp/deepbot-control-<uid>/<runId>/data/`，在沙箱里的路径是 `/data/agent/...`。原生场景在沙箱的临时目录里创建独立数据库，场景结束后回收。
- **同一任务复用 runId。** 用 `pnpm --silent verify env start --run "$R"` 加载当前代码并沿用测试数据。原生场景和桌面检查复用同工作区的 Cargo 缓存。
- **一份数据目录只能有一个后端写入。** 有 `agent.lock` 时，第二个后端会拒绝启动。不要在 CLI 之外另起后端去读写实例数据。见[后端启动入口](../../packages/agent/src/main.ts)。
- **重连没法用 CLI 场景验证。** 在原生窗口里杀掉 sidecar、再点「重连」这一步，场景步骤做不到。重连逻辑由前端回归测试 [shell.test.tsx](../../apps/desktop/tests/shell.test.tsx) 中的 `projects real protocol state…` 等用例覆盖。
- **`env restart --scope ui` 不会重启后端**，`backendGeneration` 保持不变；`--scope all` 才会重启后端。改了 `packages/agent` 必须用 `all`。
- **`requestId` 去重。** 同一个 `requestId` 配不同内容会返回「requestId 已被其他内容使用」。配相同内容则直接确认，不会重复执行。CLI 每次都会生成新的 id。
- **升级协议时**，由共享类型和[解码器](../../packages/agent/src/wire.ts)检查消息结构，另核对旧数据迁移以及旧窗口重连后的行为。
- **图片与会话库一起备份**。消息的图片元数据存于 `session.sqlite`，图片文件存于同一数据根的 `chat-images/`。旧消息没有图片字段，直接读取。图片发送随原 requestId 重发，图片读取可在重连后重试。
- **事项消息标题随快照恢复**。新交付和关联汇报的 `workTitle` 随消息持久化。新版界面读取旧字段时用同会话、同 Bot 的事项记录补出标题，无需重写 SQLite。缺少关联的历史消息按原正文显示。
- **「后台尚未加载此操作」**：前端把后端返回的「未知的协议命令」改写成「DeepBot 后台尚未加载此操作，请重启应用后重试」。出现这个提示，通常说明界面比后端新。
- **`start.sh` 和正式窗口不在 CLI 的覆盖范围内**。改了启动脚本，只能检查语法，并在报告里注明未实际启动。
