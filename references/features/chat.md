# 聊天发消息

## 1. 功能说明

在当前 Bot 的私聊会话里发一条消息。后端收下后，等一小段时间把同一会话里的消息合并成一批交给模型，Bot 的回复再出现在对话里。等待期间，三点动画旁显示当前会话的动作，输入框仍然可以继续发消息。消息还可能被识别为审批回复，或者产生事项（事项见[事项与连接器](work.md)）。

## 2. 用户路径

应用没有登录，也没有页面路由。中间一栏始终是当前 Bot 的对话。

1. 在左侧栏点一个 Bot（`id:bot-<botId>`）。启动时默认选中「小菜」（`currentBotId = "xiaocai"`）。
2. 等头部胶囊显示 Bot 名字，对话区不再显示「正在连接本机服务」。没连上时，头部右上角会出现「重连」按钮（`id:agent-reconnect`），这时发送按钮不可用。
3. 在底部输入框（占位文字「给 <名字> 发消息」）输入或粘贴内容。文字在当前宽度自动折行，输入区随内容增高，达到上限后可以在框内滚动。Shift+Enter 插入换行。切换 Bot 后返回可继续编辑原草稿。
4. 点「发送」或按回车。你的消息以 Bot 颜色的气泡出现在右侧，输入框清空。
5. 稍等片刻，左侧出现 Bot 的灰色回复气泡。悬停在这一行，气泡右侧显示「回复」和三点「更多」。
6. 点「回复」会在输入框上方添加引用，可点「取消引用」。点「更多」并选「复制」会把该条回复的正文原文写入系统剪贴板，窗口顶部显示「成功：已复制回复」。
7. 聚焦输入框后用 Ctrl+V（macOS 用 ⌘V）粘贴截图，或点输入框左侧加号「添加附件」（`id:composer-add-attachment`）选择 PNG、JPEG 或 WebP 图片。选择其他格式时顶部显示支持格式。待发图片排在圆角输入框内的正文上方，加号与发送键位于底部两端。点缩略图右上角可移除。可只发图片，也可附文字或引用。发送确认且气泡图片加载后，待发缩略图清空。已发送图片随聊天记录保留。
8. 收到事项交付或关联汇报时，在 Bot 气泡正文上方看「事项 · 标题」。长标题单行省略。复制仍取正文，引用保留事项关联。
9. 点击 Bot 回复的 Markdown 链接。网页交给系统浏览器，本地绝对路径交给对应的系统应用。文件不存在、路径超出权限或系统无法打开时，在顶部查看失败原因。

## 3. 前后端对应

- **覆盖** 接口 `message.send`、`message.send-images`、`message.image`、`message.open-file`

| 层 | 位置 |
| --- | --- |
| 对话区 | [ChatPane.tsx](../../apps/desktop/ui/features/chat/ChatPane.tsx) 的 `chat-scroll`、`bot-pill`、`agent-reconnect`。[MessageBubble.tsx](../../apps/desktop/ui/features/chat/MessageBubble.tsx) 的 `message-<messageId>`、`reply-<messageId>`、`message-more-<messageId>`。复制走原生 `Menu` 和 `Clipboard`。审批和提问卡片在 [AttentionCard.tsx](../../apps/desktop/ui/features/chat/AttentionCard.tsx) |
| 输入框 | [Composer.tsx](../../apps/desktop/ui/features/chat/Composer.tsx)：`composer-send`。[MessageInput.tsx](../../apps/desktop/ui/components/MessageInput.tsx)：`composer-input`，无障碍名「消息」。草稿按 Bot 分开保存 |
| 前端状态 | [state/bots.ts](../../apps/desktop/ui/state/bots.ts)：`currentBot`、`conversationItems`。[state/runtime.ts](../../apps/desktop/ui/state/runtime.ts)：`canSend = connected && hydrated` |
| 后端接口 | 纯文本用 `message.send`（`botId`、`threadId`、`text`，可选 `replyTo`、`workId`）。附图用 `message.send-images`，另含 `images: [{name, data}]`（Base64），允许空正文。读取气泡图片用 `message.image`（`messageId`、`imageId`），返回 `message.image.loaded`。回复审批用 `attention.reply`。[protocol.ts](../../packages/agent/src/protocol.ts) |
| 后端处理 | [runtime/app.ts](../../packages/agent/src/runtime/app.ts) 的 `case "message.send"` 匹配待答提问，再用客户端请求 ID 保存一条用户消息。命中提问时交给 `answerAttention()`，并保留提问的事项关联。普通聊天由 [work/ledger.ts](../../packages/agent/src/work/ledger.ts) 的 `queueInput()` 放进待处理队列，等待 `settings.debounceMs`（默认 1200 毫秒）后由前台对话调用模型 |
| 数据 | 消息、附件元数据、思考状态和错误在 `session.sqlite` 的 `deepbot.ledger` 文档。图片字节以内容摘要命名，保存在数据根目录的 `chat-images/`，随气泡读取。前台模型上下文中的用户消息包含图片块。旧消息的附件字段可省略 |
| 快照字段 | `snapshot.messages[]`：`threadId`、`author.kind`（`person`、`bot` 或 `system`）、`kind`、`text`、`requestId`，事项消息可带 `workId`、`workTitle`。运行状态用 `snapshot.chatActivity[threadId]`。旧 sidecar 的 `snapshot.typing[threadId]` 为真时显示「正在处理」 |

## 4. 用 verify CLI 怎么驱动

```bash
R=$(pnpm --silent verify env start | node -pe 'JSON.parse(require("fs").readFileSync(0)).runId')

# 界面：给小菜输入「你好，验证一下」，点发送，等到 DEEPBOT_VERIFY_OK
pnpm --silent verify ui run chat-send --run "$R"
pnpm --silent verify ui run chat-send --target native --run "$R"

# 隔离原生窗口：真实工具轮次、派活、流式回复、切换 Bot 和失败后收起
pnpm --silent verify ui run chat-activity --target native --run "$R"

# 原生输入框：短句、自动折行、达到上限、点击发送并收回单行
pnpm --silent verify ui run chat-composer --target native --run "$R"

# 只走后端。ack 只表示收下了，回复要过一会儿再读快照
printf '%s' '{"botId":"xiaocai","threadId":"dm:xiaocai","text":"你好"}' |
  pnpm --silent verify api call message.send --run "$R"
pnpm --silent verify api snapshot --run "$R" | node -pe '
  JSON.parse(require("fs").readFileSync(0)).result.event.snapshot.messages
    .filter(m => m.threadId === "dm:xiaocai").map(m => m.author.kind + ": " + m.text).join("\n")'

# 追查某次发送。网页发出的请求 ID 以 desktop- 开头
pnpm --silent verify logs read --source protocol --request-id <requestId> --run "$R"

pnpm --silent verify env stop --run "$R"   # 用完停止实例。不再需要数据时，按验证技能「收尾」一步删除
```

场景文件是 [chat-send.json](../../tools/control/scenarios/chat-send.json)，截图为 `01-typed` 和 `02-replied`。测试实例里的模型是本地替身，回复固定为 `DEEPBOT_VERIFY_OK`。

## 5. 注意事项

- **`threadId` 是 `dm:<botId>`，不是 Bot id 本身**。两者对不上时返回 `API_REJECTED`「Bot 与会话不匹配」。
- **`message.send` 的 ack 早于回复**。回复要等 1.2 秒的合并窗口，再加上模型调用的时间。用 API 验证时要轮询快照，直到 `author.kind === "bot"` 的消息出现；用场景验证时等 `text:DEEPBOT_VERIFY_OK`。
- **连续发几条可能只得到一次回复**。合并窗口内同一会话的消息会并成一批，后到的消息还会推迟这一批的处理时间。这是设计行为，不是丢消息。
- **核对重复气泡时沿请求 ID 查入库和处理日志**。相同内容主动发送两次会生成不同的请求 ID，各保存一条消息。重连重放同一请求会再次收到 `ack`，只保留原消息和原处理记录。
- **聊天状态按会话读取**。Agent 在前台运行投影中读取 `LiveDoc`。模型处理显示「正在思考」，实际执行工具显示「正在使用工具」，独立的创建或改派轮次显示「正在安排事项」，观察到流式正文显示「正在组织回复」。同一轮里刚成功执行的工具结果最多保留 900 毫秒，减少连续调用之间的闪动。排队、模型重试等显示「正在处理」，后台执行进度看「动态」。断线时收起动画，重连通过最新快照恢复，旧历史无需迁移。
- **只有一个待处理审批时，单独发「同意、批准、确认、拒绝、不同意、取消、yes、no」会被当成审批回复**，不会进入普通聊天。验证普通聊天时不要用这些词。
- **图片来源和限制**：NSH 输入框使用宿主的原生图片粘贴，Linux 的 GTK 把位图转换为 PNG。文件选择使用 NSH 系统图片选择器。支持 PNG、JPEG、WebP，每条最多三张，单张 6 MiB、合计 12 MiB、单张上限 3600 万像素。入库前会校验，必要时缩小到最长边 2000 像素。文件管理器复制的文件路径提示改用选择器。
- **图片发送范围**：提交给当前 Bot 绑定的模型配置。确定仅支持文本时提示切换模型，无法自动识别时提示到「设置 → 模型」声明输入能力。两种拒绝均发生在图片入库前，并保留正文和附件草稿。T3/ACP 事项的补发仍使用文本协议。新版界面连旧后台时，独立的图片发送命令会被明确拒绝。
- **发图失败的临时提示**：`state/runtime.ts` 将拒绝事件交给共用 `notify()`，错误提示按[统一反馈](../../design/components/feedback.md)计时关闭。重试会产生新的提示，待发图片仍可编辑。
- **确认到显示的过渡**：`ack` 确认图片已入库。当前会话收到确认后，待发预览保留到本次消息的气泡图片全部加载，或原位置显示「重试加载」。切到其他 Bot 后，已确认的草稿可直接清空，返回时从聊天记录加载。查瞬时闪烁时连续录制待发区和气泡，并对照 `ack`、`message.image.loaded` 和实际出图帧。
- **历史 Markdown 文件链接**：含空格的路径可用尖括号或 `%20`，末尾 `:行` 或 `:行:列` 指向同一个文件。桌面传 `message.open-file` 的 `messageId` 和绝对 `path`，后台按消息所属 Bot 的当前权限与目录校验，复用资料库文件的系统打开流程。历史正文无需迁移，打开请求在重连后由用户重新点击。
- **Linux 打开器结果**：点击后若文件存在却没有打开，按请求 ID 对照 `message.open-file` 的回包和系统打开器的退出状态。后台使用 GIO 交接给默认应用，GIO 缺失时使用 `xdg-open`。启动进程后还要等待交接结果，失败或超时会在对话顶部显示。
- **原生图片验收**：`chat-send` 回归文本发送。截图剪贴板和系统文件选择器用私有 GTK 显示实操，截图、模型接收摘要和重启回读随验证报告归档。
- **回车提交**：原生 `chat-composer` 复核短句、折行、达到上限和点击发送后的回缩。多行输入使用私有 GTK 显示补充实操回车、Shift+Enter、系统剪贴板和滚轮。
- **悬停和系统剪贴板读回**需要补充原生操作。用 `chat-send --target native` 核对发送与收到回复，再在隔离显示上悬停 Bot 气泡，依次核对「回复」「更多」、菜单中的「复制」和顶部反馈。同一显示上读回剪贴板，与该条消息正文逐字比较。自己的消息在气泡左侧保留「回复」入口。
- **原生场景用全新数据**，只有默认的「小菜」。要在原生窗口里给别的 Bot 发消息，场景里得先创建它，可以参照 [create-bot.json](../../tools/control/scenarios/create-bot.json)。
- **隔离运行**：`chat-activity` 由本地模型替身驱动真实 Agent 工具和流式事件。在线模型和外部连接器的验证另行记录。
- **视觉上**：自己的气泡在右侧、用 Bot 颜色；Bot 气泡在左侧、灰底；气泡最大宽度 640px。改动时对照[布局](../../design/layout.md)、[反馈](../../design/components/feedback.md)，以及 [消息宽度](../../apps/desktop/tests/message-width.test.tsx) 回归。
- **Bot 资料与配置**（右侧信息栏的动态、资料库、配置）不属于这份地图，第 2 轮会单独整理。
