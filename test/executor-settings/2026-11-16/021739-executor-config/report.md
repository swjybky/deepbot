# 执行器配置（self 思考等级、上下文窗口、图片输入、AGENTS.md、取消 64 轮上限）验证记录

- 时间与时区：2026-11-16 02:17–02:24 PST
- 验证人：Claude（Claude Code）
- 目标/触发条件：用户要求为 Bot 自己的后台执行（self）打开思考等级、不设 64 轮硬上限、读取 AGENTS.md、可增大上下文窗口、支持图片输入，并在设置里新增「执行器」页集中配置；不做手动压缩，不加 grep
- 代码：Git SHA e332450；本次差异文件：`packages/agent/src/protocol.ts`、`src/work/ledger.ts`、`src/runtime/app.ts`、`src/bot/self.ts`、`tests/runtime.test.ts`、`tests/policy.test.ts`；`apps/desktop/ui/features/settings/sections/ExecutorSettings.tsx`（新）、`SettingsDialog.tsx`、`ui/state/{ui,preferences,runtime}.ts`、`FixtureApp.tsx`、`tests/shell.test.tsx`、`tests/executor-layout.test.tsx`（新）。工作区另有大量其它会话的未提交改动
- 环境：Ubuntu Linux 7.0.0，NSH 0.4.0 (e626a8d)，Wayland 会话，原生测试窗口 1280×800，缩放 1，Noto CJK
- 数据：后端测试用内存/临时目录与确定性测试模型；原生截图用 FixtureApp（`executorPage` 参数直接打开设置页）；真实模型检查使用用户 `models.json` 的临时副本，原文件未改，密钥不进记录
- 参照：DESIGN.md、design/components/select.md、switch.md；同一设置窗口里的「权限」页结构
- 总结论：代码检查、原生显示与 Fixture 交互通过；真实 sidecar 下的完整事项执行未验证

## 复现与预期

1. 前置条件：自定义模型（例如用户的 `deepseek/deepseek-flash`）在注册时是 `reasoning: false`、只接受文本、上下文窗口按 128K 估算；self 的 `thinkingLevel` 默认 `off`，`maxTurns: 64`，不读 AGENTS.md
2. 操作：设置 →「执行器」修改思考等级、上下文窗口、图片输入、读取项目说明；派给 self 一件事
3. 预期：self 的请求带上所选思考等级，使用所选上下文窗口（0 表示跟随模型），可以把读到的图片交给模型，指令里包含从外到内的 AGENTS.md（没有时用 CLAUDE.md），超过 64 轮也不会被截断；前台对话的模型不受影响；进程重启后正在执行的 self 能找回自己的模型别名
4. 同类入口：进行中的 self 在设置修改后从下一次请求生效；重新打开（work_send）的事项按当前设置运行；旧账本自动补默认执行器配置

## 代码检查

| 命令 / 工作目录 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `pnpm check`（仓库根目录） | 0 | 通过 | [check.log](logs/check.log) |
| `pnpm --filter @deepbot/agent test` | 0 / 60 | 60 通过（新增 3 项） | [agent-test.log](logs/agent-test.log) |
| `nsh test apps/desktop` | 0 / 72 | 72 通过（新增 1 项） | [headless.log](logs/headless.log) |
| 临时 tsconfig 包含 src、tests、test 运行 `tsc`（ERR-005） | 0 | 通过（修正 policy.test 的 Settings 字面量） | 命令输出为空 |
| `nsh test apps/desktop --target linux --filter 'executor page'` | 0 / 1 | 通过 | 终端输出 |

unknown class 检查：`rg -n -i 'unknown class' logs` 无匹配。

新增后端回归（`packages/agent/tests/runtime.test.ts`）：
- `self runs with the executor settings…`：71 次 self 请求（70 轮工具后回答）不被截断；self 的模型是 `self:test` 别名，上下文窗口 1,000,000、`reasoning: true`、输入含 image，请求带 `reasoning: "high"`；外层 AGENTS.md 在内层之前，同目录有 AGENTS.md 时不读 CLAUDE.md；读取 PNG 后下一次请求里有 image 内容；前台仍是 `test` 模型、128K、只有文本、没有 reasoning；非法思考等级和过小的窗口被拒绝
- `executor settings off…`：关闭后无 reasoning、只有文本、窗口跟随模型、不读 AGENTS.md
- `a self run interrupted by a restart…`：执行中关闭进程，用全新的模型注册表重开后，self 在别名上继续并按设置运行（窗口 256K、reasoning low）

## 原生截图与实际对比

| 检查项与位置 | 参照/修改前图片 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 「执行器」页布局 | 新页面，参照「权限」页结构（无修改前图） | [02-after-executor-page.png](screenshots/02-after-executor-page.png) | 左侧导航「执行器」选中；分组卡片撑满右侧；四行标题与说明完整，无中文裁切；下拉和开关右对齐；说明文字在卡片下方 | 通过 |
| 上下文窗口下拉弹层 | design/components/select.md | [03-context-menu.png](screenshots/03-context-menu.png) | 弹层右对齐触发器，当前项「跟随模型」加粗高亮，六个选项完整 | 通过 |
| 选择 1M、关闭图片输入后 | 02 | [04-after-change.png](screenshots/04-after-change.png) | 触发器显示「1M」，图片输入开关变灰关闭，其余不变；命令记录里 `executor.contextWindow=1000000`、`images=false` | 通过 |

是否实际打开原图：是。截图尺寸/环境是否一致：一致（1280×800，Wayland）。
实际入口点击、输入、保存和持久化结果：原生测试中点击下拉、选项与开关成功并发出 settings.update；Fixture 不写真实账本，持久化由后端回归覆盖。
Fixture 覆盖范围与真实业务覆盖范围：截图用 FixtureApp；后端行为用确定性测试模型覆盖，未在真实 sidecar 下派工。
动画关键帧/录屏：不适用（开关沿用既有组件动画）。

## 真实业务与产物

| 操作/输入 | 预期 | 实际结果 | 后端证据/产物及校验值 | 结论 |
| --- | --- | --- | --- | --- |
| 用户默认模型（本机代理 127.0.0.1:3425，openai-completions）分别以关闭 / 中 / 高思考等级请求「1+1=?」 | 带推理参数不报错 | 三次均 `stop`，回答 2（该模型关闭时也会返回思考块） | 临时副本已删除，原 models.json 未改 | 通过 |
| 真实 sidecar 中从聊天派工给 self | 按执行器配置运行 | 未执行 | — | 未验证 |

## 失败、未验证项与复验

- 未验证：真实桌面应用 + 真实 sidecar 下从聊天派活给 self 的端到端流程，以及设置在应用重启后读回
- 复验：`./start.sh` 启动，设置 →「执行器」选上下文 1M、思考「高」，在聊天里让 Bot 派一件需要读图片或多轮命令的事，核对事项完成；重启应用后确认设置保持
- 关联 ERROR.md：ERR-009（模型配置与解析）补充了 self 模型别名的防复发规则

## 最终结论

代码检查通过；原生显示通过；Fixture 实际交互通过；真实业务只验证了用户模型接受推理参数，真实 sidecar 下的端到端派工未验证。

对话中展示的最终结果图片：`screenshots/04-after-change.png`（选择 1M、关闭图片输入后的执行器页），以及 `02-after-executor-page.png`（默认状态）。
