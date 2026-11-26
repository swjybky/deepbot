# 动态与事项

## 1. 功能说明

在聊天里交代的事，Bot 会开成「事项」：有目标、验收标准、派活对象、进度和产物。事项交给 Bot 自己的后台分身，或交给可以派活的连接器（如 T3 Code）去执行。

右侧信息栏的「动态」页列出：

- 进行中的事项；
- 即将进行的例行；
- 这台电脑的连接状态；
- 可展开的「已结束」事项。

点一个事项会打开事项详情，在详情里可以停止事项、改派给别的执行者、预览产物。

## 2. 用户路径

1. 点中间头部的 Bot 胶囊（`id:bot-pill`），打开右侧信息栏，默认就在「动态」页（`infoTab = "activity"`）。
2. 「事项」区（`id:works-active`）：每个进行中的事项是一张卡片（`id:work-<workId>`），执行中时会有脉冲点（`id:work-<workId>-running`）。没有事项时显示「暂无进行中的事项」。
3. 「即将进行」区：例行列表，每个都带开关；入口是「暂无例行」或「管理例行」，见 [Bot 配置、规矩与例行](bot-configuration.md)。
4. 「已结束」（`id:works-ended-toggle`）：点击展开或收起（`id:works-ended`）。
5. 点事项卡片，弹出「事项详情」（`id:work-detail-dialog`，`modal = "workDetail"`），内容包括：
   - 目标和验收标准；
   - 派活对象：未结束的事项可以在这里改派；
   - T3 Code 中需要手动处理的请求：点「打开 T3 Code」定位原派工线程。桌面不可用时会提示原因，有网页链接时可另点「在浏览器打开」；
   - 目录、进度、Bot 已代批的操作；
   - 产物：点开可预览，点「返回事项」回到详情。
6. 未结束的事项，标题栏右侧有「停止事项」按钮（`id:cancel-work-<workId>`）。

## 3. 前后端对应

- **覆盖** 界面 `tab:activity`、`modal:workDetail`；接口 `work.cancel`、`work.reassign`

| 层 | 位置 |
| --- | --- |
| 动态页 | [BotInfoPanel.tsx](../../apps/desktop/ui/features/bot-info/BotInfoPanel.tsx) 中的 `Activity()` 和 `WorkListCard()` |
| 事项详情 | [WorkDetail.tsx](../../apps/desktop/ui/features/bot-info/WorkDetail.tsx)：`work-detail-dialog`、`work-detail-<id>`、`work-progress-<id>`、`work-approvals-<id>`、`cancel-work-<id>`、`work-preview-back` |
| 前端状态 | [state/bots.ts](../../apps/desktop/ui/state/bots.ts) 的 `currentWorks`；[state/runtime.ts](../../apps/desktop/ui/state/runtime.ts) 的 `cancelWork()`、`reassignWork()`、`assigneeOptions`、`phaseLabels` |
| 后端接口 | `work.cancel` 和 `work.reassign`，由 [runtime/app.ts](../../packages/agent/src/runtime/app.ts) 的 `cancelWork()` 和 `reassign()` 处理。事项状态通过 `work.updated` 事件和快照推送 |
| 执行 | Bot 自己的后台分身见 [bot/self.ts](../../packages/agent/src/bot/self.ts)，外部执行者见 [connectors/](../../packages/agent/src/connectors/)。派活规则在 [work/ledger.ts](../../packages/agent/src/work/ledger.ts) 和 [policy/gate.ts](../../packages/agent/src/policy/gate.ts) |
| 数据 | 都在 `deepbot.ledger` 文档里：`data.works[]`（`phase` 取值为 queued、running、waiting、review、done、failed、cancelled）、`data.assignments[]`、`data.artifacts[]`。后台执行的对话记录在 pi-durable 的 `conversations`、`entries` 和 `tasks` 表中 |
| 快照字段 | `snapshot.works`、`snapshot.assignments`、`snapshot.artifacts` |

## 4. 用 verify CLI 怎么驱动

```bash
R=$(pnpm --silent verify env start | node -pe 'JSON.parse(require("fs").readFileSync(0)).runId')

# 从对话发送合成关键词，完成场景并截图
pnpm --silent verify ui run work-flow --run "$R"
pnpm --silent verify ui run work-flow --target native --run "$R"

# 两件后台事项交付相同正文，核对各自的标题
pnpm --silent verify ui run work-deliveries --run "$R"
pnpm --silent verify ui run work-deliveries --target native --run "$R"

# 后端：用不存在的事项验证预演和错误提示
printf '%s' '{"workId":"work-missing"}' | pnpm --silent verify api call work.cancel --run "$R"          # 只预演
printf '%s' '{"workId":"work-missing"}' | pnpm --silent verify api call work.cancel --apply --run "$R"  # 「事项不存在」，退出码 1
printf '%s' '{"workId":"work-missing","assignee":"self"}' | pnpm --silent verify api call work.reassign --run "$R"

# 事项的真实流程由回归测试覆盖：后端 runtime.test.ts，前端 shell.test.tsx、work-list.test.tsx
pnpm --silent verify check run --scope all --run "$R"

pnpm --silent verify env stop --run "$R"   # 用完停止实例。不再需要数据时，按验证技能「收尾」一步删除
```

[work-flow.json](../../tools/control/scenarios/work-flow.json) 发送 `DEEPBOT_VERIFY_WORK`，从动态打开事项详情、展开目标、关闭并连续重开，检查每次重开恢复默认摘要。

## 5. 注意事项

- **远端 T3 Code**：使用所选执行器 ID 调用 `work_projects`，将项目 ID 和同一执行器 ID 传给 `work_start` 或 `work_reassign`。项目 ID 可跨电脑路径差异，派工时在该实例的项目列表查验。事项详情改派到远端 T3 Code 时，从所选实例读取项目，选中项目后提交改派。配置修改、断线、重启后的进度、补发、停止和审批都按原派工的实例 ID 路由。
- **打开原 T3 线程**：事项详情和聊天共享 [T3 跳转按钮](../../apps/desktop/ui/components/T3ThreadButtons.tsx)。[路由逻辑](../../apps/desktop/ui/state/t3-thread.ts) 按请求的派工 ID 查 `sessionRef`，核对 T3 回执里的线程 ID，再把原环境和线程 ID 交给已注册的 T3 Code 协议。Linux [原生启动器](../../apps/desktop/src/t3_link.rs) 用 GIO 调用协议处理器，避免 GTK 的通用链接打开接口弹出应用选择器。连接快照的 `t3.desktopLocal` 只标记内置回环连接。旧派工继续读原有回执，旧后台快照缺少该字段时按无法确认桌面连接处理。远端执行器缺少本机桌面连接的确认时提供原网页入口。标准 `work-flow` 场景检查事项详情，共用跳转回归见 [T3 跳转测试](../../apps/desktop/tests/t3-thread-link.test.tsx)，系统协议和窗口定位须用隔离 T3 桌面补验。

- **派工额度**按事项所属 Bot 的 `maxConcurrent` 执行，未设置时为 10。持久任务在等待时约每 300 毫秒重试本地准入，待处理的聊天批次及同一事项旧派工的取消仍可暂缓启动。等待回复或验收的事项只要派工记录仍为 `running` 就继续占用额度。执行器接单后的执行与排队由执行器处理。
- **验证关键词 `DEEPBOT_VERIFY_WORK`** 让本地模型调用 `work_start`，真实 sidecar 记录合成事项和后台分配。场景覆盖动态列表和详情，外部执行和产物使用对应的回归用例核对。
- **补发给 T3 Code**：`work_send` 先把补充存进待投递队列，工具回执说明仍在 DeepBot 排队。后台调用 `t3_thread_send(mode: "auto")`，用线程 ID 和本地补发 ID 生成稳定的请求 ID。事项进度根据 T3 回执更新。T3 若排队，后续按消息 ID 确认补充进入哪一轮。排队用的 run 被取消时，仍按事项关联的实际执行判断完成或失败。排查时对照连接器记录里的 `inputs`、T3 的 `activeRunId` 和 `recentRuns`。回归入口见 [runtime.test.ts](../../packages/agent/tests/runtime.test.ts) 和 [connectors.test.ts](../../packages/agent/test/connectors.test.ts)。
- **`work.cancel` 默认只预演**，要加 `--apply`。已结束的事项再取消不会报错，直接忽略。
- **改派**：只有 `state === "open"` 的事项会显示改派下拉框。新执行者会接手原事项的身份和产物；旧执行者如果不支持取消，要等它结束才会启动新的。
- **派活对象不可用时，下拉框里的选项是禁用的**，比如测试实例里的 T3 Code。
- **「已结束」默认收起**，每次切换 Bot 或重新打开信息栏都会收起。
- **聊天中的事项标题**：事项详情在动态页。Bot 调用 `work_review` 完成交付或调用 `say` 带 `workId` 汇报时，消息保存事项标题并在正文上方显示。历史交付与关联汇报可通过原有 `workId` 查回标题。排查时核对 `snapshot.messages[].workTitle`、`state/bots.ts` 的 `messageWorkTitle()` 和 `MessageBubble.tsx`。普通聊天和开工回执使用普通气泡。
- **视觉上**：卡片、状态和脉冲点的规则见[事项列表](../../design/components/list.md)，停止和返回按钮见[按钮](../../design/components/button.md)。事项详情的弹窗宽度为 `min(760, 窗口宽 - 32)`。
- **详情开合**：NSH 的 `Dialog` 淡入会一起改变遮罩和卡片的不透明度，聊天气泡会从已出现的卡片透出。事项详情使用 `animation="none"`。检查首帧用原生录屏，场景截图用于核对稳定后的界面。
- **进度刷新与悬停**：事项快照更新时，详情弹窗、摘要/进度卡和动态列表内的同一事项行应保持原生节点。用 [后台刷新与交互状态](../../design/layout.md#后台刷新与交互状态) 的原生对照检查颜色与挂载记录，同时确认展开状态和改派菜单保留。
