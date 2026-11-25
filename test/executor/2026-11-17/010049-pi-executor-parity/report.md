# 后台分身 self 对齐 Pi Coding Agent 全量优化验证记录

- 时间与时区：2026-11-17 01:00–01:49 PST（America/Los_Angeles）
- 验证人：Antigravity
- 目标/触发条件：将 DeepBot 后台分身 `self` 的工程能力全面对齐 Pi Coding Agent：释放 `self` 并行工具执行（保持前台工具串行）、`read` 安全崩溃重放、`<dataDir>/tmp/` 命令与溢出临时目录隔离及空闲清理、已结束事项追问重开（`work_send`）复用原 `self` 会话、结构化派工单去重与去双重转义、窗口比例自适应压缩与 `anthropic-messages` 思考模式 `maxTokens` 上调、`stopReason === "length"` 自动续写与 `report_question` 混调等待保护、全局 `AGENTS.md` + 多目录渐进式 `SKILL.md` 索引、`write`/`edit` `beforeTool` 目录与权限钩子拦截、`handoff` 跨阶段上下文重置、`explore` 只读探索子代理，以及 `LiveDoc` 实时工具状态投影到事项进度
- 代码：Git SHA `e332450`；本次修改文件：`packages/agent/src/policy/gate.ts`、`packages/agent/src/bot/self.ts`、`packages/agent/src/bot/tools.ts`、`packages/agent/src/runtime/app.ts`、`packages/agent/tests/policy.test.ts`、`packages/agent/tests/runtime.test.ts`、`apps/desktop/ui/features/settings/sections/ExecutorSettings.tsx`、`apps/desktop/tests/executor-layout.test.tsx`、`README.md`、`ERROR.md`、`error/model-config.md`（工作区另有其它历史未提交文件，未触碰）
- 环境：Linux（Ubuntu 7.0.0），Node v24.15.0，NSH CLI（Linux GTK 4 / Wayland 会话），原生窗口 1280×800，文字缩放 1.0，字体 Noto Sans CJK SC
- 数据：后端测试使用隔离临时目录与确定性脚本模型（覆盖内存与 SQLite 持久化）；桌面与原生截图使用 `FixtureApp.tsx`（`executorPage` 与 `workDetail`），未触碰用户 `~/.deepbot` 真实会话库或密钥
- 参照：[DESIGN.md](../../../../DESIGN.md)、[design/components/list.md](../../../../design/components/list.md)，以及上一轮执行器页基线图 `test/executor-settings/2026-11-16/021739-executor-config/screenshots/02-after-executor-page.png`
- 总结论：Agent 与全量测试文件类型检查、后端 67/67、桌面 `nsh check`、全量 headless 76/76、Linux 原生渲染与两行实时进度卡片显示通过；原生 Wayland 注入点击下拉框触发既知 [ERR-006](../../../../error/linux-native-input.md) 未响应；真实外部付费模型长任务派工未在本轮运行

## 复现与预期

1. 前置条件：
   - 原 `Harness.open` 全局设为 `toolExecution: "sequential"`，`self` 多路只读工具无法并发；`read` 默认为 `replay: "unsafe"`；`bash` 临时与溢出文件落在系统 `/tmp`；
   - 已结束事项通过 `work_send` 追问重开时新建空会话丢失原上下文；派工单直接 `JSON.stringify(brief)` 重复注入 `instructions` 并双重转义 `context`；
   - `stopReason === "length"` 会被误判为 `ready`；同轮混调 `[report_progress, report_question]` 后输出说明文字可能提前提审；
   - 缺少全局 `~/.deepbot/AGENTS.md` 与 `SKILL.md` 渐进式发现、`write`/`edit` 目录硬校验、`handoff`、`explore` 子代理及 `LiveDoc` 实时进度投影。
2. 执行操作：
   - 后端通过 7 组集成回归测试覆盖并发互锁 `bash` + `$TMPDIR`/`spillPath` 隔离清理、重开事项会话复用与 `executionLog` 去重、`length` 续写与混合提问等待、全局说明与多级 `SKILL.md` 覆盖、`beforeTool` 拦截越界 `write`/`edit`（含 `@`/`~`/`file://`）并保留 `bash`、`explore` 只读子代理 + `handoff` 重置、`LiveDoc` 实时工具及输出尾部投影；
   - 桌面端核对「设置 → 执行器」说明更新与「事项详情 → 进度」两行实时状态原生渲染。
3. 可观察预期结果：
   - 全部 8 项新增测试（`policy.test.ts` + `runtime.test.ts`）与既有回归全部通过；无 `unknown class`；原生窗口文字完整无裁切，卡片对齐符合设计规范。
4. 同类入口与边界：
   - 跨连接器改派（`self` → 外部连接器）仍走全新交接包，仅紧邻前任同为 `self` 且会话存活时复用 `conversationId`；
   - `explore` 子会话仅开放 `read` 与 `bash`，排除 `deepbot.worker` 以杜绝递归派生。

## 代码检查

工作目录均为仓库根目录。

| 命令 / 工作目录 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `packages/agent/node_modules/.bin/tsc -p packages/agent/tsconfig.json --noEmit` | 0 | Agent `src` 类型检查通过 | [agent-tsc.log](logs/agent-tsc.log) |
| 临时 `tsconfig.verify.json` 覆盖 `packages/agent/{src,tests,test}` 运行 `tsc --noEmit`（ERR-005） | 0 | 含 `*-live.ts` / `*-smoke.ts` 全部零错误（已清理临时配置） | [agent-tsc-all.log](logs/agent-tsc-all.log) |
| `node --test packages/agent/tests/*.test.ts packages/agent/test/*.test.ts` | 0 / 67 | 67/67 全部通过（新增 7 项执行器能力回归 + 路径规范化断言） | [agent-test.log](logs/agent-test.log) |
| `/home/swj/.local/bin/nsh check apps/desktop` | 0 | 桌面 TSX 与 Rust 编译检查通过 | [nsh-check.log](logs/nsh-check.log) |
| `/home/swj/.local/bin/nsh test apps/desktop` | 0 / 76 | 76/76 全量 headless 界面测试通过（新增事项两行实时进度测试） | [headless.log](logs/headless.log) |
| `/home/swj/.local/bin/nsh test apps/desktop --target linux --filter "work detail renders self two-line"` | 0 / 1 | Linux 原生窗口事项详情两行实时进度渲染通过 | [native-work-progress.log](logs/native-work-progress.log) |
| `/home/swj/.local/bin/nsh test apps/desktop --target linux --filter "executor page renders"` | 1 / 0通过、1失败 | 原生执行器页挂载、文案断言与首屏截图成功；Wayland 注入点击下拉触发器未展开 `1M`（ERR-006） | [native-executor-page.log](logs/native-executor-page.log) |

unknown class 检查：`grep -rn -i "unknown class" test/executor/2026-11-17/010049-pi-executor-parity/logs/` 无匹配。

## 原生截图与实际对比

| 检查项与位置 | 参照/修改前图片 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 「设置 → 执行器」页全局说明与 `SKILL.md` 描述 | [修改前执行器页](../../../executor-settings/2026-11-16/021739-executor-config/screenshots/02-after-executor-page.png) | [01-executor-page.png](screenshots/01-executor-page.png) | 左侧「执行器」选中态、分组卡片右边缘对齐、下拉与开关控件位置与修改前完全一致；第 4 行副标题更新为「读取全局与事项目录层级的 AGENTS.md（或 CLAUDE.md）及可用技能 SKILL.md」，单行完整显示无中文裁切、未挤压右侧开关 | 通过 |
| 右侧「动态 → 事项详情」两行实时进度摘要 | [design/components/list.md](../../../../design/components/list.md) 两行摘要规则 | [02-work-live-progress.png](screenshots/02-work-live-progress.png) | 「进度」卡片第 1 行显示 `阶段一：核对测试`，第 2 行显示 `LiveDoc` 投影 `第 3 轮 · 正在执行 bash：npm test (12/1…`，超出两行宽度处按规则显示省略号并保留右侧展开箭头 `>`；上方返回与红色实心停止图标正常 | 通过 |

是否实际打开原图：是（已逐张打开核对两张本次 1280×800 原图及参照原图）。截图尺寸/环境是否一致：一致（1280×800，Linux Wayland，Noto Sans CJK SC）。
实际入口点击、输入、保存和持久化结果：headless 76/76 覆盖完整点击与 `settings.update` 命令；Linux Wayland 原生注入点击受既知 `ERR-006` 影响未展开下拉菜单，未做掩盖。
Fixture 覆盖范围与真实业务覆盖范围：原生截图通过 `FixtureApp.tsx` 驱动；后端真实 `DeepBotApp` + SQLite + 真实子进程 `bash`/文件系统经 67 项自动回归验证。
动画关键帧/录屏：不适用（本轮未修改动画曲线或面板运动逻辑）。

## 真实业务与产物

| 操作/输入 | 预期 | 实际结果 | 后端证据/产物及校验值 | 结论 |
| --- | --- | --- | --- | --- |
| 真实 `DeepBotApp` + SQLite 下 `self` 并发 `bash`、`$TMPDIR`/`spillPath` 隔离清理、重开事项复用 `conversationId`、`SKILL.md` 加载、`beforeTool` 拦截越界 `write`/`edit`、`explore` + `handoff`、`LiveDoc` 实时进度 | 67 项全部按契约运行 | 67/67 通过，临时目录在验收后自动清空 | 见 [agent-test.log](logs/agent-test.log) | 通过 |
| 真实桌面 sidecar 连接外部在线大模型端到端派工 | 按新执行器链路完成事项 | 本轮未触发外部付费 API 调用 | — | 未验证 |

## 失败、未验证项与复验

- 失败/受阻步骤：`nsh test apps/desktop --target linux --filter "executor page renders"` 在首屏渲染和截图完成后，Wayland 下合成点击下拉框未弹出菜单（`no pressable view matches text:1M`），属既知 [ERR-006](../../../../error/linux-native-input.md) 原生自动点击限制；同用例在 headless 下通过。
- 未验证项：用户真实桌面会话中重启后连接在线模型执行端到端 `self` 派工与手动点击体验。
- 下一轮复验命令与人工操作：运行 `./start.sh` 启动真实桌面端，打开「设置 → 执行器」确认文案与开关，向 Bot 发起多文件代码检索或长命令事项，在右侧「动态 → 事项详情」观察两行实时进度更新，完成后追问补充要求确认原会话秒级续做。
- 关联 ERROR.md 条目：已更新 [ERR-009](../../../../error/model-config.md)（沉淀并行/串行分离、会话复用去重、路径规范化与截断续写防复发规则）及 [ERR-006](../../../../error/linux-native-input.md)。

## 最终结论

- 代码检查：通过（Agent `src` 与全量测试 `tsc` 0 错误，后端 67/67 通过，桌面 `nsh check` 通过，全量 headless 76/76 通过，无 `unknown class`）。
- 原生显示：通过（1280×800 Linux 原生截图已实际打开对比，执行器页与事项详情两行实时进度排版、字体均正常）。
- 实际交互：headless 交互通过；Linux Wayland 原生自动点击受既知 ERR-006 限制未完成下拉点击验收。
- 真实业务：本地 SQLite + 真实进程/文件系统闭环通过；在线大模型端到端派工待用户日常会话复验。

对话中展示的最终结果图片：`screenshots/01-executor-page.png`（更新全局说明与 `SKILL.md` 描述后的「设置 → 执行器」页）、`screenshots/02-work-live-progress.png`（右侧事项详情「进度」卡片展示阶段汇报 + `LiveDoc` 实时工具脉搏）。
