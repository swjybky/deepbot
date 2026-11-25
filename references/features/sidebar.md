# 侧栏：切换与管理 Bot

## 1. 功能说明

左侧栏列出所有 Bot，分为三个区域：

- 置顶区：大头像网格；
- 普通列表：按最近活动排序；
- 「已隐藏的 Bot」：可展开。

点一个 Bot 就切到它的对话。对 Bot 点右键，弹出系统菜单，可以：

- 置顶或取消置顶
- 标为已读或未读
- 重命名
- 复制对话 ID
- 隐藏或重新显示
- 删除

把 Bot 拖进或拖出置顶区，也能置顶或取消置顶。创建 Bot 见[创建 Bot](create-bot.md)，账户行入口见[设置](settings.md)。

## 2. 用户路径

应用没有登录和页面路由，左侧栏一直显示。

1. **切换**：点置顶区的头像或列表里的一行（`id:bot-<botId>`）。中间头部胶囊和输入框的占位文字随之改变。如果开了「打开对话时展开 Bot 信息」，右侧信息栏会自动打开。
2. **右键菜单**：在 Bot 上点右键，弹出系统菜单，菜单项依次为：
   - 「置顶」或「取消置顶」
   - 「标为已读」或「标为未读」
   - 「重命名 Bot」
   - 「复制对话 ID」
   - 「从侧边栏隐藏」或「在侧边栏显示」
   - 「删除」
3. **重命名**：点「重命名 Bot」，弹出「重命名」窗口（`modal = "renameBot"`），改名后点「保存」（`id:rename-bot-submit`）。
4. **删除**：点「删除」，弹出系统确认框「删除 Bot」。确认后，这个 Bot 的对话、事项、例行和记忆都会被删掉，无法恢复。
5. **隐藏**：隐藏后，Bot 移到列表底部的「已隐藏的 Bot」（`id:sidebar-hidden-toggle`），点它可以展开。
6. **拖拽**：按住 Bot 拖到置顶区（`id:sidebar-pinned-zone`）就置顶，拖到列表区（`id:sidebar-list-zone`）就取消置顶。

## 3. 前后端对应

- **覆盖** 界面 `modal:renameBot`；接口 `bot.delete`

| 层 | 位置 |
| --- | --- |
| 侧栏 | [Sidebar.tsx](../../apps/desktop/ui/features/sidebar/Sidebar.tsx)：`showBotMenu()` 是右键菜单，用 NSH 的 `Menu.popup`；`confirmDelete()` 是删除确认，用 `AlertDialog`；拖拽由 `DragSource` 实现 |
| 重命名弹窗 | [RenameBotDialog.tsx](../../apps/desktop/ui/features/sidebar/RenameBotDialog.tsx)：`rename-bot`、`rename-bot-name`、`rename-bot-submit` |
| 前端状态 | [state/bots.ts](../../apps/desktop/ui/state/bots.ts)：`pinnedBots`、`otherBots`、`hiddenBots` 三个列表及其排序；`setBotPinned`、`setBotHidden`、`renameBot`、`deleteBot` 四个操作。[state/unread.ts](../../apps/desktop/ui/state/unread.ts)：未读状态，存在本机 NSH Storage，不经过后端。[state/ui.ts](../../apps/desktop/ui/state/ui.ts)：`openBot()` |
| 后端接口 | 置顶、隐藏、改名都通过 `bot.upsert` 整体更新，带上 `pinned`、`hidden` 或 `name`。删除用 `bot.delete`。两者都在 [runtime/app.ts](../../packages/agent/src/runtime/app.ts) 中处理 |
| 数据 | `deepbot.ledger` 文档的 `data.bots[]`，相关字段为 `pinned`、`pinnedAt`、`hidden`、`createdAt`。删除会连带清掉该 Bot 的 `threads`、`messages`、`works`、`assignments`、`artifacts`、`attentions`、`rules`、`routines`、`memories` |

## 4. 用 verify CLI 怎么驱动

```bash
R=$(pnpm --silent verify env start | node -pe 'JSON.parse(require("fs").readFileSync(0)).runId')

# 界面：创建「验证助手」 → 切回小菜
pnpm --silent verify ui run sidebar-switch --run "$R"
pnpm --silent verify ui run sidebar-switch --target native --run "$R"

# 右键菜单由原生宿主提供
pnpm --silent verify ui run sidebar-context --target native --run "$R"

# 置顶、隐藏、改名都走 bot.upsert，必须带 name
printf '%s' '{"bot":{"id":"verify-bot","name":"验证 Bot"}}' | pnpm --silent verify api call bot.upsert --run "$R"
printf '%s' '{"bot":{"id":"verify-bot","name":"验证 Bot","pinned":true}}' | pnpm --silent verify api call bot.upsert --run "$R"
printf '%s' '{"bot":{"id":"verify-bot","name":"验证 Bot","pinned":false,"hidden":true}}' | pnpm --silent verify api call bot.upsert --run "$R"
printf '%s' '{"bot":{"id":"verify-bot","name":"改名后","hidden":false}}' | pnpm --silent verify api call bot.upsert --run "$R"

# 删除：先预演，核对目标后再 --apply
printf '%s' '{"botId":"verify-bot"}' | pnpm --silent verify api call bot.delete --dry-run --run "$R"
printf '%s' '{"botId":"verify-bot"}' | pnpm --silent verify api call bot.delete --apply --run "$R"

# 读回
pnpm --silent verify api snapshot --run "$R" | node -pe '
  JSON.stringify(JSON.parse(require("fs").readFileSync(0)).result.event.snapshot.bots
    .map(b => ({ id: b.id, name: b.name, pinned: b.pinned, hidden: b.hidden })))'

pnpm --silent verify env stop --run "$R"   # 用完停止实例。不再需要数据时，按验证技能「收尾」一步删除
```

[sidebar-switch.json](../../tools/control/scenarios/sidebar-switch.json) 截图为 `01-switched`，[sidebar-context.json](../../tools/control/scenarios/sidebar-context.json) 截图为 `02-context-rename`。

## 5. 注意事项

- **右键菜单**用 `rightClick` 和 `chooseMenuItem`。原生场景打开「重命名 Bot」后用回车保存。Chromium 宿主的系统菜单未打开，切换场景可以用两种宿主执行。菜单里的「删除」仍要求声明 `destructive`，并显式传入 `--apply`。
- **拖拽和删除确认框**由 [sidebar-drag.test.tsx](../../apps/desktop/tests/sidebar-drag.test.tsx) 和 [shell.test.tsx](../../apps/desktop/tests/shell.test.tsx) 覆盖。删除后端效果可用上面的 `api call` 验证。
- **`bot.upsert` 必须带 `name`**，否则返回「Bot 名称和编号不能为空」。不能同时置顶和隐藏。隐藏时要同时带上 `pinned: false`，前端 `setBotHidden()` 就是这样做的。
- **置顶顺序按置顶时间，最早置顶的在前。** 普通列表按创建时间和最后一条消息时间中较新的那个排序。时间戳由后端设置，前端传入的会被忽略。
- **未读状态只存在本机 NSH Storage 里**，不在快照中，`api snapshot` 读不到。原生场景每次都是全新的 Storage。
- **删除有三道限制**：
  - 不加 `--apply` 只预演；
  - 至少要保留一个 Bot；
  - Bot 正在回复、有未结束的事项或待处理输入时，会被拒绝。
  - 删除不可恢复。截图证据请在删除前取。
- **`sidebar-switch` 每跑一次都会新建一个「验证助手」。** 重跑会累积同名 Bot。
- **`id:bot-<botId>` 只适用于固定 id 的 Bot**，比如 `xiaocai`，或用 `api call` 造的 Bot。在界面里新建的 Bot，id 是随机的，见[创建 Bot](create-bot.md)。
- **「复制对话 ID」复制的是 `threadId`**（`dm:<botId>`），不是 Bot id。
- **视觉上**：置顶区是 `w-24` 的头像卡片，居中换行排列。列表行包含 42 号头像、名字，以及最后一条消息（单行省略）。未读时，普通行在名字右侧显示 8pt 圆点，置顶卡片在头像右上角显示 14pt 圆点。详见[侧栏规范](../../design/sidebar.md)。
- 拖动的手势阈值、预览和区域高亮写在[侧栏规范](../../design/sidebar.md)的「跨区拖动」一节。
