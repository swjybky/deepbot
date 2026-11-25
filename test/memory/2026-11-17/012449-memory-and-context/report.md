# 对话管理与长期记忆闭环优化验证记录

- 时间与时区：2026-11-17 01:24–02:40 PST（America/Los_Angeles）
- 验证人：Antigravity
- 目标/触发条件：针对个人 Bot 跨天对话与长期记忆的 5 项结构性短板进行改进：
  1. 补齐长期记忆闭环：协议新增 `memory.delete`、前台新增 `memory_forget` 工具与同 `id` 覆盖更新引导、右侧面板「资料库 → 记住的事」每条记忆旁增加垃圾桶删除图标，并将外部连接器（T3/ACP）派工的 `Brief.context.memory` 收敛为空数组以保护个人隐私（仅 `self` 接收）；
  2. 补齐普通消息引用与时间锚点：`message.send` 入队时附带 `sentAt`（ISO 时间）及普通 `replyTo` 摘要（被引用消息 ID、发送者角色、正文前 500 字），`tick()` 头部附带当前 ISO 时间；
  3. 补齐跨轮讨论到后台交接：`work_start` 与 `Work` 新增可选 `context`（前序背景），`sourceMessageIds` 允许附带当前单聊里 Bot 先前的方案消息且合并保留 `activeSources`（确保当批用户的点名/否定指令仍受 `ERR-011` 校验），`self` 的 `formatBriefPrompt` 展示前序讨论背景与带 `[用户]`/`[Bot]` 标识的关联消息；
  4. 前台上下文减负与自动压缩：`createFrontExtension` 通过 `pi-durable` 动态 `section("deepbot_state", ...)` 在 `SystemMessage.sections` 中按变更增量投递记忆/关联文件夹/派活对象/工具连接器/已确认规矩，不再每轮在 `user` 消息重复拼接；`tick()` 附带近期最多 5 条已结束事项摘要；`resolveModel` 为前台模型注册基于上下文窗口的 `compactionOverrides`；
  5. 长周期精确回溯：前台新增只读工具 `history_search`（按关键词与 `scope` 检索当前 Bot 历史消息原话、旧事项与产物），并更新 `FRONT_INSTRUCTIONS`。
- 代码：Git SHA `e332450`；本次差异文件：`packages/agent/src/protocol.ts`、`packages/agent/src/runtime/app.ts`、`packages/agent/src/bot/tools.ts`、`packages/agent/src/bot/self.ts`、`packages/agent/tests/runtime.test.ts`、`apps/desktop/ui/features/bot-info/BotInfoPanel.tsx`、`apps/desktop/FixtureApp.tsx`、`apps/desktop/tests/shell.test.tsx`、`design/components/button.md`（工作区另有其它既有未提交改动，未触碰）
- 环境：Linux 7.0.0-43-generic x86_64，Node v26.13.1，NSH 0.4.0 (`e626a8d`)，Wayland 会话（`XDG_SESSION_TYPE=wayland`、`WAYLAND_DISPLAY=wayland-0`、`GDK_BACKEND=unset`），原生测试窗口 1280×800，缩放 1.0，字体 Noto CJK
- 数据：后端测试使用隔离临时目录与确定性测试模型（含内存及 SQLite 持久重启）；桌面与原生截图使用 `FixtureApp.tsx`（`panelActions` 与 `infoTab: "library"`），未触碰 `~/.deepbot` 用户真实会话库或模型密钥
- 参照：[DESIGN.md](../../../../DESIGN.md)、[design/components/button.md](../../../../design/components/button.md)（右侧 Bot 信息面板操作规范）、修改前原生基线图 [01-library-before.png](screenshots/01-library-before.png)
- 总结论：类型检查（含未纳入 `tsconfig` 的脚本）、后端 70/70、全量桌面 headless 76/76、Linux 原生「资料库」渲染与前后对比均通过；真实桌面 sidecar + 在线模型长对话端到端流程未在本轮自动运行

## 复现与预期

1. 前置条件：
   - 长期记忆仅有 `memory_set` / `memory.upsert`，无工具删除、协议删除与桌面删除按钮，外部派活也会携带全部个人记忆；
   - `tick()` 每轮向 `pi.user` 重复注入记忆、文件夹、连接器、规矩全量 JSON，既挤压 `keepRecentTokens` 又缺少前台 `compactionOverrides`；
   - 普通消息引用回复 `replyTo` 未进入模型输入，事件无时间戳，已结束事项不在看板内；`work_start` 仅支持用户消息作来源，无跨轮背景参数与历史关键词检索工具。
2. 从真实入口执行的操作：
   - 桌面入口：打开右侧「资料库」Tab，查看「小菜 记住的事」下记忆条目，原地编辑记忆文本、新增记忆、切换 Bot 验证隔离、点击垃圾桶图标依次删除记忆并观察空状态回显；
   - 后端流程：跨进程重启持久化记忆、使用 `memory_forget` 与 `memory.delete` 删除记忆、普通消息 `replyTo` 与时间戳注入、`work_start` 传递 `context` 与 Bot 方案消息、外部连接器隐私剔除、验收后近期已结束事项索引、`history_search` 跨压缩原话与旧事项检索。
3. 可观察的预期结果：
   - 记忆编辑/新增/删除命令正确发出，全部删除后显示“还没有长期记忆，可以在下面添加或在聊天里交代”；
   - 原生窗口中记忆输入框左对齐且横向撑满可用宽度，右侧垃圾桶图标与下方 `+` 按钮列对齐、无裁切；
   - 后端全部 70 项测试通过，`deepbot_state` 仅随变更增量写入 `SystemMessage.sections` 而不重复污染 `user` 消息。
4. 其它同类入口与边界：
   - `BotConfiguration` 中关联文件夹行（`trash` ghost 图标）与 `ArtifactCard` 产物行（`file`/`external` ghost 图标）使用相同右侧 `IconButton` 规范；
   - `work_start` 合并 `sourceMessageIds` 与 `activeSources` 后仍由 `route()` 按 `author.kind === "person"` 提取最近一条点名/否定指令，不影响既有 `ERR-011` 路由规则。

## 代码检查

工作目录均为仓库根目录。

| 命令 / 工作目录 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm check` | 0 | `pnpm -r typecheck`、`nsh check apps/desktop` 与 Rust crate 编译全部通过（最终编辑后重跑） | [check.log](logs/check.log) |
| 临时 `tsconfig.verify.json` 覆盖 `packages/agent/{src,tests,test}` 运行 `tsc --noEmit`（ERR-005） | 0 | 含 `*-live.ts` / `*-smoke.ts` 全部零类型错误（校验后已清理临时文件） | 终端退出码 0 |
| `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm --filter @deepbot/agent test` | 0 / 70 | 70/70 全部通过（更新 1 项系统 section 断言 + 新增 3 项记忆/交接/检索回归） | [agent-test.log](logs/agent-test.log) |
| `nsh test apps/desktop` | 0 / 76 | 76/76 全量 headless 界面测试全部通过（覆盖 `memory.delete` 与空状态回显） | [headless.log](logs/headless.log) |
| `nsh test apps/desktop --target linux --filter 'bot info library tab renders its actions natively'` | 0 / 1 | Linux 原生「资料库」Tab 渲染通过 | 终端输出 |

unknown class 检查：`grep -rn -i "unknown class" test/memory/2026-11-17/012449-memory-and-context/logs` 无匹配（退出码 1）。

## 原生截图与实际对比

| 检查项与位置 | 参照/修改前图片 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 右侧面板「资料库 → 小菜 记住的事」记忆条目与删除图标 | [01-library-before.png](screenshots/01-library-before.png) | [02-library-after.png](screenshots/02-library-after.png) | 修改前记忆输入条占满整宽且无删除入口；修改后「用中文回复」输入框左侧与占位输入框及上方产物卡片对齐、横向撑满左侧可用空间（无 `ERR-001` 窄缩留白），右侧新增居中对齐的 `trash`（`ghost`）图标按钮，与下方 `+` 添加按钮垂直对齐；中文笔画、占位提示、产物卡片与头像布局完整无裁切或遮挡 | 通过 |

是否实际打开原图：是（通过图片读取查看 `01-library-before.png` 与 `02-library-after.png` 原图）。截图尺寸/环境是否一致：一致（均在 1280×800、Linux Wayland 原生测试窗口生成）。
实际入口点击、输入、保存和持久化结果：headless 测试 `memories live under the library tab of each bot` 从真实面板入口完成记忆编辑、添加、跨 Bot 切换隔离校验、点击删除并验证空状态；持久化、重启恢复和协议幂等由后端 `runtime.test.ts` 覆盖。
Fixture 覆盖范围与真实业务覆盖范围：原生截图与桌面界面测试基于 `FixtureApp.tsx`；后端协议、状态投影、模型消息构造及工具逻辑由 `runtime.test.ts` 的确定性脚本模型和隔离 SQLite/临时目录覆盖。
动画关键帧/录屏：不适用（未修改面板或列表过渡动画）。

## 真实业务与产物

| 操作/输入 | 预期 | 实际结果 | 后端证据/产物及校验值 | 结论 |
| --- | --- | --- | --- | --- |
| 记忆持久化、重启读取、不重复进 `user` 与 Bot 隔离 | 记忆进 `SystemMessage.sections.deepbot_state`，跨轮未变时不重复追加，跨 Bot 隔离 | 符合预期 | `runtime.test.ts`: `essential memory keeps its source across restart and stays private to its bot` 通过 | 通过 |
| `memory_forget`、`memory.delete` 与外部连接器隐私边界 | 同 `id` 更新递增 `revision`；`self` 可见记忆而外部连接器 `memory` 为 `[]`；工具与协议均可删除且校验归属 | 符合预期 | `runtime.test.ts`: `memory_forget, memory.delete and external connector memory privacy` 通过 | 通过 |
| 普通 `replyTo`、ISO 时间戳、`work_start.context`、Bot 方案引用与近期已结束事项 | 事件含 `sentAt` 与 `replyTo` 摘要；`self` 收到前序背景与 `[用户]`/`[Bot]` 消息；`activeSources` 保留否定点名拦截；结束后进入近期已结束列表 | 符合预期 | `runtime.test.ts`: `cross-turn handoff carries plain replyTo, timestamps, recent ended works and bot plan messages` 通过 | 通过 |
| `history_search` 与前台 `compactionOverrides` | 搜回当前 Bot 早期消息原话与已结束事项，不跨 Bot 泄露；前台模型注册窗口压缩覆盖 | 符合预期 | `runtime.test.ts`: `history_search finds early messages and ended works within the bot's own thread and resolveModel sets compaction overrides` 通过 | 通过 |
| 真实 sidecar + 在线模型跨天聊天与真派工 | 实际模型按新提示词调用 `memory_forget` / `history_search` / `work_start.context` | 未运行 | — | 未验证 |

## 失败、未验证项与复验

- 缺失环境/失败步骤：未在本轮使用真实外部付费模型与桌面 sidecar 运行人工端到端跨天对话；Linux 原生测试运行了 `FixtureApp` 渲染截图，未在真实用户窗口中人工点击。
- 影响范围：新工具描述与 Prompt 引导在真实模型上的主动触发倾向需在真实模型下进一步体验微调。
- 下一轮具体复验命令与人工操作：
  1. 启动真实桌面端：`./start.sh`（使用隔离 `DEEPBOT_DATA_DIR`），与 Bot 讨论需求方案后引用其回复发起事项，核对后台 `self` 收到完整背景；
  2. 在右侧「资料库 → 记住的事」添加并点击垃圾桶图标删除记忆，重启应用确认持久化；
  3. 触发多轮对话后在聊天中要求查找早期消息细节，核对 Bot 主动调用 `history_search` 回答。
- 关联 ERROR.md 条目：[ERR-001](../../../../error/nsh-ui.md)、[ERR-005](../../../../error/protocol-migration.md)、[ERR-009](../../../../error/model-config.md)、[ERR-011](../../../../error/executor-naming.md)。

## 最终结论

- 代码检查：通过（`pnpm check` 退出码 0、全目录 `tsc` 退出码 0、后端 70/70 通过、全量 headless 76/76 通过、无 `unknown class`）。
- 原生显示：通过（`01-library-before.png` 与 `02-library-after.png` 均已实际打开对比，输入框拉伸、垃圾桶图标对齐、中文渲染完整）。
- 实际交互：Fixture 覆盖通过（headless 完成编辑、添加、Bot 切换与全部删除后空状态回归）。
- 真实业务：后端隔离会话全流程与持久重启通过；真实桌面 sidecar 接入在线模型的端到端实测待下一轮复验。

对话中展示的最终结果图片：`test/memory/2026-11-17/012449-memory-and-context/screenshots/02-library-after.png`（右侧「资料库」Tab 中“小菜 记住的事”记忆条与新增垃圾桶删除入口的 Linux 原生渲染截图）。
