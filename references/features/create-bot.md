# 创建 Bot

## 1. 功能说明

新建一个 Bot。需要填名字、选头像形状和颜色、选模型配置。创建后它会出现在侧栏，并拥有自己的私聊会话和工作目录，界面马上切到它的对话。

## 2. 用户路径

应用没有登录，也没有页面路由。界面是固定三栏，弹窗由 `modal` 信号控制，见 [state/ui.ts](../../apps/desktop/ui/state/ui.ts)。

1. 点左侧栏右上角的「+」（`id:sidebar-create`，无障碍名「创建新 Bot」），弹出「创建新 Bot」窗口（`modal = "createBot"`）。
2. 在「给你的 Bot 起个名字」输入框填名字。最多 24 个字，去掉首尾空格后不能为空。在框里按回车等同于点「创建」。
3. 点一个形状。默认是 `jelly`，可选值见 [theme/avatar.ts](../../apps/desktop/ui/theme/avatar.ts)。
4. 点一个颜色。默认是「红色」。
5. 「模型配置」下拉框默认选当前默认模型，也可以换成别的。
6. 点「创建」后弹窗关闭，侧栏的非置顶列表多出这个 Bot 并处于选中状态。中间头部胶囊显示新名字，对话区显示「开始聊天，或把一件事交给 Bot」。

## 3. 前后端对应

- **覆盖** 界面 `modal:createBot`；接口 `bot.upsert`

| 层 | 位置 |
| --- | --- |
| 入口按钮 | [Sidebar.tsx](../../apps/desktop/ui/features/sidebar/Sidebar.tsx)，`sidebar-create` 调用 `openModal("createBot")` |
| 弹窗 | [CreateBotDialog.tsx](../../apps/desktop/ui/features/create-bot/CreateBotDialog.tsx)，testID 为 `create-bot`、`create-bot-name`、`create-bot-model`、`create-bot-submit`。形状和颜色只有无障碍名，分别是 `形状 <名称>` 和颜色名 |
| 前端状态 | [state/bots.ts](../../apps/desktop/ui/state/bots.ts)，`createBot()` 生成 `bot-<requestId>` 作为 id，发出 `bot.upsert`，然后立即把 `currentBotId` 切过去，不等 ack |
| 后端接口 | `bot.upsert`，见 [protocol.ts](../../packages/agent/src/protocol.ts) 中的 `Command`。由 [runtime/app.ts](../../packages/agent/src/runtime/app.ts) 的 `case "bot.upsert"`、`defaultBot()`、`putBot()` 处理 |
| 数据 | 项目没有为每个功能单独建表。Bot 和会话写在 `session.sqlite` 里 pi-durable 的 `documents` 表中，是一份 `deepbot.ledger` 文档的 `data.bots` 和 `data.threads` 字段。另外会建一条 `conversations` 记录，作为这个 Bot 的前台对话，并创建目录 `<数据根>/bots/<id>/workspace` |
| 快照字段 | `snapshot.bots[]`，包含 `id`、`name`、`shape`、`color`、`modelConfigId`、`threadId = "dm:<id>"`、`workspace`、`createdAt`；以及 `snapshot.threads[]` |

## 4. 用 verify CLI 怎么驱动

```bash
R=$(pnpm --silent verify env start | node -pe 'JSON.parse(require("fs").readFileSync(0)).runId')

# 界面：点 +、填「验证助手」、选六角和蓝色、创建，截两张图
pnpm --silent verify ui run create-bot --run "$R"
pnpm --silent verify ui run create-bot --target native --run "$R"

# 读回：应有 name 为「验证助手」、shape 为 hex、color 为 #2183F2 的 Bot
pnpm --silent verify api snapshot --run "$R" | node -pe '
  JSON.stringify(JSON.parse(require("fs").readFileSync(0)).result.event.snapshot.bots
    .map(b => ({ id: b.id, name: b.name, shape: b.shape, color: b.color, modelConfigId: b.modelConfigId })))'

# 只走后端：用固定 id 造 Bot，后续场景和 api call 可以直接引用
printf '%s' '{"bot":{"id":"verify-bot","name":"验证 Bot","shape":"hex","color":"#2183F2"}}' |
  pnpm --silent verify api call bot.upsert --run "$R"

pnpm --silent verify env stop --run "$R"   # 用完停止实例。不再需要数据时，按验证技能「收尾」一步删除
```

场景文件是 [create-bot.json](../../tools/control/scenarios/create-bot.json)。成功时 `ui run` 返回 `ok: true`，截图为 `<前缀>-01-create-dialog.png`（弹窗填好时）和 `<前缀>-02-bot-created.png`（创建后）。

## 5. 注意事项

- 创建时自动获得已启用「新建 Bot 默认可用」的连接器授权。之后可在[连接](connectors.md)编辑名单。

- **新 Bot 的 id 每次都不同**，形如 `bot-desktop-<时间>-<序号>-<随机>`。场景里不能写 `id:bot-<id>`，要用 `label:查看 <名字> 的信息`（头部胶囊）或 `text:<名字>` 来定位。需要固定 id 时改用 `api call bot.upsert`。
- **名字可以重复**。同一实例里每跑一次 `create-bot`，就多一个叫「验证助手」的 Bot。本轮读回时有 3 个同名 Bot，`text:验证助手` 会匹配到多处。头部胶囊只显示当前 Bot，所以场景用的是 `label:查看 验证助手 的信息`。读回时按最新的 `createdAt` 取。
- **`text:<名字>` 也会匹配到输入框里的文字**。确认创建成功前，先 `gone` 掉 `id:create-bot`。
- **原生场景每次用全新数据**。在 `--target native` 里创建的 Bot 不会出现在 `api snapshot` 里，无头浏览器里创建的才能读回。
- **`bot.upsert` 是整体更新，不是补丁**。改名、置顶、隐藏都要带上 `name`，见 `updateBot()`。命令里带 `provider`、`model`、`cwd` 或 `enabledExecutors` 会被拒绝，返回「请从模型配置中选择 Bot 的模型」。必须用 `modelConfigId` 指向一份已有的模型配置。
- **同时置顶和隐藏会被拒绝**。`folders` 里的路径必须在后端所在的机器上真实存在，否则返回「文件夹不存在」。
- **前端不等 ack 就切换到新 Bot**。后端拒绝时界面会切到一个不存在的 id，然后回退到列表里的第一个 Bot（这是读代码得出的，没有实测）。判断是否成功要看 `api snapshot`，不能只看截图。
- **删除入口在侧栏右键菜单。** 原生右键驱动见[侧栏管理](sidebar.md)。`bot.delete` 默认只预演，至少要保留一个 Bot，有进行中事项时也会被拒绝。
- **视觉上**：形状网格是 5+5+3 三行，选中项有一圈细边框；颜色两行，选中项有双圈描边。改动这些时对照 [头像](../../design/components/avatar.md) 和 [弹窗](../../design/components/dialog.md)。
- **选择其他模型的路径未用 CLI 实测。** 种子数据里只有一份模型。多模型选择由 [shell.test.tsx](../../apps/desktop/tests/shell.test.tsx) 中的 `new bots use the configured default and allow a different model` 覆盖。
