# 事项交付标题验证

- 时间为 2026-11-24 18:24 起，PST。Git 基线为 `e332450`，测试取工作区源码。
- verify 实例为 `f9696146bedd5c02`。修复前指纹为 `8388ab7ffc7f472f967d6137237bee1c0a91d77f20bd3ac3e3c1515b6f22a198`，最终指纹见[重启结果](artifacts/restart.json)及[证据报告](artifacts/evidence.json)。
- Ubuntu 26.04.1 LTS，Linux 7.0.0-43-generic，Node 26.13.1，NSH 0.4.0（e626a8d）。原生窗口使用 GTK X11、私有 Xvfb，截图均为 1270×790。本机中文字体匹配为 Noto Sans CJK SC。浏览器使用无头 Chromium。
- Chromium 与隔离 CLI 共用真实 Node sidecar 和 SQLite。原生场景经正式 `App.tsx` 启动独立 sidecar 和新数据库。两者使用同一个本地模型替身，透过已注册的工具完成开工、后台 self 执行、读取证据和验收。

## 原因与改动

1. `acceptReport()` 把后台汇报和 `workId` 交给前台负责人。原 `reviewWork()` 保存 `kind: "result"`、正文与 `workId`。`say` 传入 `workId` 时也会保存这层关联。自由文本和未指定事项的 `say` 没有关联字段。 [后台处理](../../../../packages/agent/src/runtime/app.ts) · [工具定义](../../../../packages/agent/src/bot/tools.ts)
2. `publish()` 将消息与事项记录一起发进快照，`wire.ts` 接收 `workId`。桌面 `state/bots.ts` 将交付投影为文字消息并保留 `workId`，`MessageBubble` 原先只用它设置引用。已有事项关联在气泡里缺少可读呈现。 [协议](../../../../packages/agent/src/wire.ts) · [消息投影](../../../../apps/desktop/ui/state/bots.ts) · [气泡](../../../../apps/desktop/ui/features/chat/MessageBubble.tsx)
3. 交付与显式关联汇报从已有事项记录保存可选的 `workTitle`，气泡在正文上方显示「事项 · 标题」。历史消息在同 Bot、同会话内补查标题，原有数据库可直接读取。消息缺少可确认的关联时按原正文显示。 [布局约定](../../../../design/layout.md#消息气泡featureschatmessagebubbletsx) · [功能地图](../../../../references/features/work.md)

## 从真实聊天入口复现

`work-deliveries` 在小菜的聊天输入条发送合成触发词。模型替身连续开两件不同标题的事项，两件均在首条交付出现前建立。后台交来结果后，负责人分别调用 `work_detail` 和 `work_review`，两条交付正文都写成「修好了，可以验收」。随后发送一条普通问候，看普通聊天是否还能收发。

| 检查 | 修复前 | 修复后 |
| --- | --- | --- |
| 两条同正文交付 | 快照里有两份不同的 `workId`，气泡文字完全一样 | 每条气泡分别显示「修复消息菜单与复制」和「修复图片粘贴与发送…」，快照中两条消息的 `workTitle` 分别对应自己的事项 |
| 长标题与右侧动态 | 原气泡只有正文 | 标题在一行内省略，正文完整。打开动态并展开「已结束」后，两张事项卡片可见，气泡仍正常对齐 |
| 普通消息 | 问候、普通回复和开工回执都用普通气泡 | 原生图中这些消息仍只有正文。气泡中未见内部编号 |
| 历史与重启 | 两条历史交付仅有 `workId` | 升级后旧消息内容逐条一致。桌面回归覆盖历史标题补查、无法关联时只显示正文和引用保留关联。新交付在重启后读回相同的消息 ID、正文和标题 |

已实际查看[修复前原生截图](screenshots/01-before-native.png)、[修复后原生截图](screenshots/02-after-native.png)和[动态面板展开截图](screenshots/03-after-panel-native.png)。气泡和悬停操作的布局以 [对话区设计](../../../../design/layout.md#对话区) 为参照。

![两条正文相同的交付分别展示事项标题](screenshots/02-after-native.png)

## 命令与证据

以下 verify 命令均从仓库根目录运行。场景、读回与源码检查均使用同一实例。

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| `pnpm --silent verify ui run work-deliveries --target native --run f9696146bedd5c02` | 0 | [修复前场景](logs/before-native.log)、[最终场景](logs/after-native.log)、[截图摘要](artifacts/native.json) |
| `pnpm --silent verify ui run work-deliveries --run f9696146bedd5c02` | 0 | [修复前场景](logs/before-browser.log)、[最终场景](logs/after-browser.log)、[结果](artifacts/browser.json) |
| `pnpm --silent verify api snapshot --run f9696146bedd5c02` | 0 | [修复前](artifacts/before-snapshot.json)、[修复后](artifacts/after-snapshot.json)、[历史读回](artifacts/legacy-after-restart.json)、[新交付重启读回](artifacts/persisted-deliveries.json) |
| `pnpm --silent verify check --run f9696146bedd5c02` | 0 | [完整检查](artifacts/check.json) |
| `pnpm --silent verify evidence report --run f9696146bedd5c02` | 0 | [原生截图复核](artifacts/visual-review.json)、[证据报告](artifacts/evidence.json) |

首轮原生复现因模型替身的汇报匹配条件错误停在等待交付。修正测试数据匹配后，用修复前产品代码重跑并得到上面的对照。此后一次检查因源码刚更新而报告指纹过期，重启同一实例后按最终指纹重跑。

全量检查 9/9，包含 Agent 98/98、桌面 86/86、CLI 15/15，两端类型检查与 Rust Clippy 通过。证据报告 `status: passed`，原生复核 `visualStatus: passed`。Chromium 复跑复用了原有聊天记录，另通过接口发送一条新问候并等到对应的普通回复。 [Agent 日志](logs/agent-test.log) · [桌面日志](logs/ui-test.log) · [CLI 日志](logs/control-test.log) · [最终快照](artifacts/after-snapshot.json)

## 验收范围

隔离实例用真实桌面和 sidecar 验证了并行自执行事项经正式验收流程发出交付、气泡显示归属、普通对话和动态列表。实际在线模型、真实 T3 派活、用户当前运行窗口未复验。
