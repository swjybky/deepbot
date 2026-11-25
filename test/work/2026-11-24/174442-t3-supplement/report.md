# 运行中的 T3 事项补发验证记录

- 验证时间为 2026-11-24 17:43 至 17:51，PST。JSON 记录使用 UTC。
- 环境为 Ubuntu 26.04.1 LTS、Node 26.13.1、NSH 0.4.0。
- Git 基线为 `e3324505148f078e06725ca8b29470865efc6eb1`，包含工作区现有改动和本轮补发修复。最终校验使用 verify 源码版本 `d81c81eb1120130385ab2e17cb6482567b0005433b03efa30c52350c6c3da024`。
- Bubblewrap 校验实例为 `29ed02d79486d40c`。回归使用真实 DeepBot runtime、确定性前台模型和本地 T3 MCP 替身。另用独立 SQLite 运行 DeepBot，保留默认消息防抖及轮询设置，连接真实 T3 Code 和 Codex 模型验证即时投递。

## 复现与根因

1. `createFrontExtension` 注册的 `work_send` 将补充写入 ledger 的 `effects`，本地记录 ID 是 `tool-send:1633`。后台 `deepbot.effect` 经 `DeepBotApp.processEffect` 调用 `dispatcher.send`。[Bot 工具](../../../../packages/agent/src/bot/tools.ts#L188) · [投递流程](../../../../packages/agent/src/runtime/app.ts#L2300)
2. 原先 `T3CodeConnector.send` 以 `mode: "queue"` 调用 `t3_thread_send`。T3 因此在 17:40:04.828 为同一线程创建了排在第 1 轮之后的第 2 轮。只有后续轮开始执行，或有人将补充转入当前轮，当前模型才有机会看到内容。[DeepBot 连接器](../../../../packages/agent/src/connectors/t3code.ts#L207) · [原连接器记录](artifacts/incident-deepbot.json)
3. 17:41:14.444，第 2 轮取消且 `startedAt` 为空。同一时刻，对应 `tool-send:1633` 的消息出现在第 1 轮，第 1 轮随后明确确认已读。现有痕迹与 T3 的 `dispatchQueuedMessagePromoteToSteer` 一致。该函数取消队列槽，再将同一消息送进正在执行的 run。[原线程时间线](artifacts/incident-t3.json) · [T3 投递入口](/home/swj/project/swj/t3code/apps/server/src/orchestration-v2/ThreadManagementService.ts:829) · [转入当前轮](/home/swj/project/swj/t3code/apps/server/src/orchestration-v2/Orchestrator.ts:9548)
4. 原连接器用第 2 轮覆盖事项的 `runId`。当 `events` 读到它的 `cancelled`，就发 `failed` 报告，`acceptReport` 将事项和派工结束。同期 T3 线程仍是 `running`，`activeRunId` 仍指向第 1 轮。只读检查原账本，确认事项为 `ended / failed`。[轮询](../../../../packages/agent/src/connectors/t3code.ts#L285) · [事项状态处理](../../../../packages/agent/src/runtime/app.ts#L1979) · [原事项账本](artifacts/incident-ledger.json)

修改生产代码前，用 `pnpm --silent verify check run --scope agent --run 29ed02d79486d40c` 复现，退出码 1。两条断言分别记录了补发创建第 2 轮，以及转入第 1 轮后队列取消被当成事项失败。该轮的测试替身声明另有两条 TypeScript 诊断，已补齐声明。[复现日志](logs/before-agent-tests.log)

## 修复与回归

- 改用 `mode: "auto"`，由 T3 在当前轮可接收时执行 steering。工具先回执 DeepBot 本地排队，后台再按 `delivery` 更新为 T3 排队或 T3 已接收。T3 排队时保存 `messageId`，轮询通过时间线确认消息进入实际执行的 run。
- 轮询优先跟踪事项关联的活动 run，单独处理从未执行就取消的队列槽。旧记录缺少消息 ID 时保留「送达未确认」，重连时跳过该槽此前误存的失败报告。
- 默认配置复验中，真实 T3 曾拒绝两个隔离库复用同一个本地键。最终版用线程 ID 和本地补发 ID 生成稳定键，原来正在重试的记录继续使用原键。替身回归覆盖跨线程重复本地 ID 和同线程重复投递。[T3 拒绝记录](artifacts/duplicate-key-rejection.json)

## 真实 T3 验证

在真实 T3 执行 `sleep 12` 期间，隔离 DeepBot 经 `message.send → work_send → T3` 发出带唯一标记的补充。标记只出现在本次补充正文中。

| 观测 | 实际结果 |
| --- | --- |
| 从聊天提交到 T3 回执 | 默认节奏下 1,942 毫秒，回执为 `steered` |
| 消息出现的位置 | T3 仍为 `running` 时出现在第 1 轮，runCount 为 1 |
| 模型是否实际读取 | 真实 Codex 在第 1 轮最终答复中原样返回唯一标记 |
| DeepBot 状态 | 排队回执之后记录「补充已送达 T3 Code 当前运行」，第 1 轮完成后事项进入 `open / review`，无 `failed` 报告 |
| 复核 T3 最终状态 | 唯一一轮为 `completed` |

[DeepBot 投递和事项状态](artifacts/live-t3-final.json) · [T3 原轮次读回](artifacts/final-t3-read.json) · [运行日志](logs/live-t3-final.log) · [实测的源码摘要](artifacts/live-source.sha256)

## 项目检查

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `pnpm --silent verify env restart --scope all --run 29ed02d79486d40c` | 0 | 隔离 sidecar 按最终源码启动。[重启回执](artifacts/final-restart.json) |
| `pnpm --silent verify api snapshot --run 29ed02d79486d40c` | 0 | 隔离实例返回后端快照。[接口输出](artifacts/verify-snapshot.json) |
| `pnpm --silent verify check --run 29ed02d79486d40c` | 0 | 9 项检查通过。Agent 96/96、桌面 85/85、verify CLI 15/15。[全量检查](artifacts/final-check.json) · [Agent 测试日志](logs/after-agent-tests.log) |
| `pnpm --silent verify evidence report --run 29ed02d79486d40c` | 0 | `fresh: true`、`failed: []`，状态为 `incomplete`。缺项为 `ui:native` 和 `visual-review`。[证据报告](artifacts/verify-report.json) |

验收范围为后端投递与状态判定。本轮未操作用户现有窗口，已结束的历史事项没有做数据修复。原生显示与截图复核不适用于此次后端改动。
