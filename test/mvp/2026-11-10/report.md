# 第一部分 M0–M3 实施与验收

2026-11-10，基于 [03 架构报告](../../../reports/bot-architecture-2026-11-09/03-deepbot-bots-architecture-zh.html) 第一部分。个人桌面 Bot 的运行层和原生界面已实现，并完成真实模型、内部执行、外部执行、审批和恢复验收。第二部分的群聊、外部 IM、后台常在线不在本次范围。

## 实现范围

| 阶段 | 已实现 |
| --- | --- |
| M0：IM | 协议 v2，必填 requestId，重复命令去重与冲突拒绝；每 Bot 常驻单聊；作者和消息类型；持久入账、连发合并、忙时插话、say 多条、pass 静默、表情回执；真实桌面投影与重连同步 |
| M1：事项 | 会话／事项／派工独立；Pi Durable 后台任务持有内部会话；前台预算、并发上限、定向停止、引用归属、结果回复重新打开；产物 hash、真实工具日志、负责人验收和两次返工上限 |
| M2：执行者 | self、T3 Code、human 同一端口；结构化汇报；提问卡；原事项改派与交接包；一次性内容绑定批准；文件／网页／发布／删除代码权限闸 |
| M3：扩展 | ACP stdio 与单次权限转发、支持时 session/load；确认式路由规则与设置停用；带来源和版本的 essential 记忆；持久例行到点主动开事项 |
| 原生界面 | 保留 NSH / QuickJS 架构与现有 token、组件约束；事项卡、提问卡、引用、停止／改派；Bot、目录、权限、执行者、规矩、例行、记忆设置；实际文件产物打开 |

后端组合根为 `packages/agent/src/main.ts`；账本和调度在 `runtime/app.ts`、`work/ledger.ts`，负责人／内部工具在 `bot/tools.ts`、`runtime/working-tools.ts`，执行者在 `executors/`，权限与隔离在 `policy/`。生产界面不依赖 mock；FixtureApp 只用于测试。

## 自动检查

- `pnpm check`：agent TypeScript、NSH TypeScript、Rust 全部通过
- `pnpm --filter @deepbot/agent test`：**39/39 通过**，包含实际 bubblewrap / Python / Git 执行
- `nsh test apps/desktop`：**11/11 通过**
- `nsh test apps/desktop --target linux`：**11/11 通过**，使用本机默认 Wayland
- NSH 检查与测试中无 `unknown class` 警告

后端覆盖：幂等与消息隔离、连发与插话、say/pass、前台预算移交、后台并发、定向取消、迟到汇报隔离、改派等待旧执行真正结束、产物篡改和返工、真人、批准精确绑定与单次消费、ACP 旧审批失效、规则确认与原始消息匹配、记忆隔离与重启、例行去重，以及外部执行者补充投递阻塞时前台仍可回复。

日志：[检查](mvp-acceptance/check.log)、[后端测试](mvp-acceptance/agent-tests.log)、[无窗口界面测试](mvp-acceptance/full-tests.log)、[GTK 原生界面测试](mvp-native-acceptance/native-ui-tests.log)。界面覆盖传输失败时原 requestId 重发、既有 sidecar 无 ready 时重新同步，以及 fatal / EOF 后继续操作和重连。

## 真实运行证据

| 场景 | 实际结果 | 证据 |
| --- | --- | --- |
| 原生中文对话 | 实际 GTK 窗口发送中文；首轮记住“海盐青柠”，第二轮准确回忆；鼠标点击设置和卡片生效 | [原生验收记录与截图](mvp-native-acceptance/evidence.json) |
| 内部完整执行 | 真实模型调用 Python 计算 6×7、写文件、读回、登记 SHA-256；前台同时回复用户名；负责人核验后才进入 done | [内部运行记录](mvp-acceptance/internal-live.json) |
| 真人与定向停止 | 实际原生界面创建甲乙两事项；点击停止甲，乙继续等待；在乙提问卡输入答复后独立验收完成 | [原生验收记录](mvp-native-acceptance/evidence.json) |
| 强制中断恢复 | 查询 SQLite 确认模型 generation / 内部 run_command 真正在运行时，两次 SIGKILL；同目录重启与同 requestId 重发，消息不重复，原 workId / assignmentId 恢复交付 | [崩溃恢复记录](mvp-acceptance/crash-recovery.json) |
| 原生窗口重连 | 生产 App.tsx、真实 Rust / Node、默认 Wayland；仅 SIGKILL 已核对的 Node 子进程，界面点击重连后同一 Rust host 启动新 Node；真实模型回复“重连成功”，原 18 条消息和 3 个事项全部保留 | [重连结果](mvp-native-acceptance/reconnect-result.json)、[原生日志](mvp-native-acceptance/production-reconnect-native.log)、[截图](mvp-native-acceptance/10-reconnect-real-reply.png) |
| 点名 T3 Code | 自然语言点名后真实创建 T3 线程；读取仓库 README；结果回到 Bot，由负责人验收 done | [T3 完整流程](mvp-acceptance/t3-workflow.json) |
| T3 幂等与复接 | 同 assignment 不重复开线程；两轮真实模型回复；同 inputId 不重复；重建适配器后复接 | [T3 端口实测](mvp-acceptance/t3-adapter-live.json) |
| 规矩 | 聊天提出关键词规则，确认前不生效；确认后不再点名也自动交 T3；完成后在设置关闭 | [规则流程](mvp-acceptance/rules-workflow.json) |
| 例行 | 自然语言设置一次性例行；时间到达后无新用户消息，主动开后台事项计算并交付“例行验证完成：42” | [例行流程](mvp-acceptance/routine-workflow.json) |
| 发布审批 | 内部 publish_http 创建绑定具体 URL、方法和 body 的审批；本地服务器批准前 **0** 请求，批准后精确 **1** 次 POST；读回 200 回执，负责人验收 | [发布流程](mvp-acceptance/publish-workflow.json) |
| ACP 端口 | 官方 Codex ACP 2.6.0，真实 apply_patch 文件审批；拒绝则无文件，批准才写；重启后 session/load 复接 | [ACP 端口实测](mvp-acceptance/acp-adapter-live.json) |
| ACP 完整流程 | Bot 派工 → ACP typed file 权限 → 账本审批卡 → 批准 → 文件生成 → 负责人内部 read_file 独立核验 → done；完整 diff 路径与内容匹配且只有一次批准 | [ACP 完整流程](mvp-acceptance/acp-workflow.json) |

模型使用实际 `openai-codex / gpt-6.1-terra` 登录接口。真实场景按修复后的实现分轮验收；汇总明确保留各轮来源，没有把早期失败的整轮运行标为全部通过：[分轮验收汇总](mvp-acceptance/workflows-summary.json)。所有业务测试在隔离临时数据目录中执行，凭据未写入报告或仓库。

## 必须保留的运行边界

- 内部命令依赖 Linux bubblewrap，运行于目录副本，无网络或宿主凭据；校验整批改动后写回。`node_modules` 只读，Git 可在副本内操作后同步真实结果。没有隔离条件则拒绝直接执行宿主命令。文件总量与超时限制见 README。
- T3 CLI 没有远程停止能力，权限保证弱于内部工具。只接受用户点名或确认规则，卡片明确提示外部停止；改派在原线程实际结束前保持排队。
- ACP 仅放行可分类、可校验范围的专用操作；不透明 shell/execute 请求被拒绝。真实第二种智能体用 Codex ACP 验证；Hermes 同协议入口已支持，但没有宣称本机 Hermes 的实机验收。
- 关闭桌面即关闭 sidecar；在重新启动后恢复任务和到期例行。本部分不承诺关闭桌面期间继续在线。
- 自动验收依据实际产物、工具日志和负责人核验；外部模型报告 ready 本身不等于事项完成。
- 原生重连使用 NSH 的 Linux 原生输入注入，在本机默认 Wayland 上通过。强制 `GDK_BACKEND=x11` 的对照出现按下／抬起而不触发点击；相同现象也能在 Fixture 重现，因此未把这条 Xwayland 路径记为通过。`./start.sh` 使用系统默认后端，不强制 X11。底层点击取消原因尚未确认。

## 使用

```bash
./start.sh
```

在设置中连接允许读写的文件夹，为 Bot 选择工作目录后即可实际干活。无显式 API 配置且本机 Codex 已登录时，默认只读复用其登录态。T3 自动发现本机 CLI；官方 Codex ACP 已安装到个人工具目录，重启自动发现。可复现安装与全部检查命令见 [README](../../../README.md)。
