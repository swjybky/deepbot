# 提问与审批

## 1. 功能说明

Bot 需要你拍板时，会在对话里插一张提问卡片（Attention）。卡片分四类：

| 类型 | 卡片标签 | 用途 |
| --- | --- | --- |
| `decision` | 需要你决定 | 选方案 |
| `approval` | 需要你批准 | 执行某个操作前请你同意，例如发布、删除，或 T3 的审批 |
| `rule` | 确认规矩 | Bot 在聊天中提议了一条派活规矩，确认后才生效 |
| `external` | 对方在等你 | 外部执行者在等你答复，卡片上有「打开对方页面」或「打开 T3 Code」 |

T3 Code 发来的多题提问会显示成一张表单，可以单选或多选，最后点「提交答复」。答复后，卡片收起，只显示你选的答案。

## 2. 用户路径

1. 在对话里，提问卡片按时间顺序出现在消息之间（`id:attention-<attentionId>`）。
2. 有补充说明时，可以展开查看（`id:attention-<id>-toggle`，说明文字为 `-preview`）。
3. 点一个选项（`id:attention-<id>-option-<选项文字>`），或在「其他」里输入文字后提交。
4. 发送期间，卡片显示等待状态。收到 `ack` 后，卡片只保留答案（`id:attention-<id>-answer`）。
5. T3 多题表单：逐题选择，然后点「提交答复」（`id:attention-<id>-send`）。
6. 也可以不点卡片，直接在输入框里回复。当前会话只有一个待处理的提问时，单独发「同意」「批准」「确认」「拒绝」「不同意」「取消」「yes」「no」会被当作对这张卡片的答复；`decision` 类卡片则任何文字都算答复。

## 3. 前后端对应

- **覆盖** 接口 `attention.reply`

| 层 | 位置 |
| --- | --- |
| 卡片 | [AttentionCard.tsx](../../apps/desktop/ui/features/chat/AttentionCard.tsx)：`AttentionCard` 显示普通卡片，`RemoteQuestionForm` 显示 T3 多题表单。选项卡片组件是 [ChoiceCard.tsx](../../apps/desktop/ui/components/ChoiceCard.tsx) |
| 排列 | [state/bots.ts](../../apps/desktop/ui/state/bots.ts) 的 `conversationItems`：把消息和提问按时间合并 |
| 前端状态 | [state/runtime.ts](../../apps/desktop/ui/state/runtime.ts) 的 `respond()` 发出 `attention.reply`，`attention.opened` 和 `attention.resolved` 两个事件更新列表 |
| 后端接口 | `attention.reply`（`attentionId`、`value`，可选 `answers`），由 [runtime/app.ts](../../packages/agent/src/runtime/app.ts) 的 `answerAttention()` 处理。`message.send` 也可能走到同一个函数，见上面第 6 步 |
| 审批和 T3 | [policy/gate.ts](../../packages/agent/src/policy/gate.ts) 决定哪些操作需要审批；[t3-approvals.ts](../../packages/agent/src/connectors/t3-approvals.ts) 和 [t3-questions.ts](../../packages/agent/src/connectors/t3-questions.ts) 把 T3 的请求转成卡片，再把答复回传给 T3 |
| 数据 | `deepbot.ledger` 文档的 `data.attentions[]`，字段为 `kind`、`question`、`options`、`state`、`value`、`action`、`rule`、`remoteRequest`、`replyPending` |
| 快照字段 | `snapshot.attentions` |

## 4. 用 verify CLI 怎么驱动

```bash
R=$(pnpm --silent verify env start | node -pe 'JSON.parse(require("fs").readFileSync(0)).runId')

# 从对话发送合成关键词，完成场景并截图
pnpm --silent verify ui run attention-flow --run "$R"
pnpm --silent verify ui run attention-flow --target native --run "$R"

# 后端：用不存在的提问验证「提问已处理或不存在」，退出码 1
printf '%s' '{"attentionId":"att-missing","value":"同意"}' | pnpm --silent verify api call attention.reply --run "$R"

# 卡片的真实流程由回归测试覆盖：前端 shell.test.tsx、choice-card.test.tsx，后端 runtime.test.ts
pnpm --silent verify check run --scope all --run "$R"

pnpm --silent verify env stop --run "$R"   # 用完停止实例。不再需要数据时，按验证技能「收尾」一步删除
```

## 5. 注意事项

- **长文本展开后回缩**：先用原生 trace 对照同一次点击的 `Press`、布局和下一条快照。卡片以提问 ID 挂载，T3 表单内各问题以问题 ID 挂载。相同 ID 和显示模式下更新内容时保留展开状态，只有用户折叠或切换问题才改变当前显示。见[后台刷新与交互状态](../../design/layout.md#后台刷新与交互状态)和[展开回归](../../apps/desktop/tests/choice-card.test.tsx)。

- **验证关键词 `DEEPBOT_VERIFY_ASK`** 让本地模型调用 `ask`。[attention-flow.json](../../tools/control/scenarios/attention-flow.json) 会点选「整理周报」，并截图对比待答复与已答复状态。T3 问答和审批类型继续由专门的测试覆盖。
- **一张卡片只能答复一次。** 重复答复会返回「提问已处理或不存在」；答复内容为空会返回「答复不能为空」。
- **通过输入框回答内部提问时**，用 `message.send` 的原请求 ID 查用户消息和事项转交。旧版本会额外写一条 `attention-answer:<请求 ID>`，该前缀现在继续用于直接卡片答复产生的消息。历史消息按原样显示。
- **在聊天里打出单独的「同意 / 拒绝」类词，可能会意外答复卡片。** 验证普通聊天时不要用这些词，见[聊天发消息](chat.md)。
- **T3 提问表单的选项有时会重名**，界面会在重名的选项后加「（序号）」来区分，提交时仍然回传原始值。
- **外部链接用系统浏览器打开**（`openUrl`）。在 Web 宿主里，这个行为和原生不同，没有实测过。
- **视觉上**：卡片最宽 560，靠左对齐，选中颜色跟随 Bot 颜色。说明文字超过两行时折叠。见[反馈](../../design/components/feedback.md)。
