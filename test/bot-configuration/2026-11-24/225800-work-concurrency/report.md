# Bot 事项并发上限验证

2026-11-24 晚（PST），在 `main` 的 `e332450` 工作树验证。verify 轮次为 `85172bc7f5ac6dec`，源码指纹为 `0d3be77bf3fd1005433193344e808672956aaa57311d73bd436030e1faa9aedb`。

Ubuntu 26.04.1、NSH 0.4.0（e626a8d）、Node 26.13.1。Bubblewrap 中的真实 `App.tsx` 通过 GTK/X11 在私有 Xvfb 显示，使用真实 Node sidecar、独立 SQLite 和本地模型替身。原生截图为 1270×790。

## 配置与持久化

| 操作 | 观察 | 证据 |
| --- | --- | --- |
| 进入小菜的「配置」，新建另一个 Bot 并打开其配置 | 两个 Bot 初始值均为 10 | [默认截图](screenshots/native-bot-concurrency-1795591052563-a9c2ca8c-01-default.png)、[接口读回](artifacts/api-defaults.json) |
| 输入 0 并回车 | 出现错误提示并恢复已保存的 10 | [原生步骤日志](logs/native-bot-concurrency-1795591052563-a9c2ca8c.log) |
| 小菜输入 2 后回车，第二个 Bot 输入 4 后移开焦点 | 两个 Bot 切换回来分别显示 2、4 | [小菜](screenshots/native-bot-concurrency-1795591052563-a9c2ca8c-02-first-bot.png)、[第二个 Bot](screenshots/native-bot-concurrency-1795591052563-a9c2ca8c-03-second-bot.png)、[接口读回](artifacts/api-saved.json) |
| 关闭原生场景后，用同一私有数据重新打开 GTK 和 sidecar | 复用同一 SQLite inode，配置页读回 2、4。拖窄至 240 px，标签和数值仍完整显示 | [重启日志](logs/native-restart.log)、[重启后的接口读回](artifacts/api-restarted.json)、[小菜](screenshots/bot-concurrency-restart-first.png)、[第二个 Bot](screenshots/bot-concurrency-restart-second.png)、[240 px](screenshots/bot-concurrency-restart-narrow.png) |

已逐张打开最终原生截图。新增字段在模型配置下方，沿用其余表单项的宽度、间隔和标签样式。此前的原生场景迭代修正了提示定位、输入框失焦操作和非置顶 Bot 行的定位，最终场景退出码为 0。[视觉复核](artifacts/visual-review.json)

标准场景命令为 `node tools/control/cli.mjs ui run bot-concurrency --target native --run 85172bc7f5ac6dec`。重启复验沿用该轮 Bubblewrap 的隔离挂载，使用 [复验脚本](artifacts/native-restart.py) 以相同数据目录和新 Xvfb 打开 `nsh test --target linux App.tsx`。接口读回来自该轮另一个 CLI 数据目录，用 `api call bot.upsert` 写入、`api snapshot` 查询。

## 调度与旧数据

- 按派工持久记录中的事项归属 Bot 统计 `running`，跨执行器共用该 Bot 的额度。两个执行器替身接到第一个 Bot 的 10 个事项，第 11 个保持 pending。第二个 Bot 仍可在自己的上限 1 内启动一个事项。这个用例刻意将隔离账本的旧全局字段设为 1，验证它已退出准入判断。
- 将第一个 Bot 从 10 降到 9 并重启，保留原来 10 条运行记录。释放一个名额后仍有 9 条在跑，待派事项继续等待。再释放一个名额，待派项自动启动。将第二个 Bot 的上限从 1 调到 2，原待派项自动获得会话引用。
- 旧账本中 Bot 缺少该字段时，启动迁移补上 10，已有派工和执行器引用仍可读回。新建 Bot 同样默认 10。
- 待处理的聊天批次、同一事项旧派工的取消和原有审批流程仍参与各自的准入。持久任务约每 300 毫秒重试本地准入。Pi Durable 的后台任务调度未发现额外的 2 或 3 件配额。T3 和 ACP 适配器按派工或会话处理，实际接单后的执行与限制由相应服务决定。本轮用替身验证 DeepBot 的额度，真实外部执行器吞吐未压测。

实现与回归见 [配置页](../../../../apps/desktop/ui/features/bot-info/BotConfiguration.tsx)、[调度入口](../../../../packages/agent/src/runtime/app.ts) 和 [派工测试](../../../../packages/agent/tests/runtime.test.ts)。

## 检查结果

- 固定源码快照的全量 verify check 退出码为 0，9 项全部通过。Agent 103 项、桌面 91 项、CLI 15 项。[全量检查](artifacts/verify-check.json)、[后端日志](logs/agent-test.log)、[桌面日志](logs/ui-test.log)、[CLI 日志](logs/control-test.log)
- 当前工作树另行运行并发、取消和旧数据迁移回归，3 项通过。[专项日志](logs/current-worktree-agent.log)
- `evidence report` 为 `passed`，源码指纹匹配，视觉复核通过。[验收 JSON](artifacts/verify-evidence.json)

## 验证环境记录

共享工作树在验收期间有聊天界面和协议的并行改动。上一轮全量通过后，verify 根据源码指纹将报告标为过期。[上一轮检查](artifacts/verify-check-before-freeze.json)、[上一轮报告](artifacts/verify-evidence-before-freeze.json)

第一份固定快照包含新的聊天文案和旧测试断言，两个聊天用例因此失败。最终快照包含并行事项更新的断言。本次改动相关的原生、接口和派工证据均已复验。[首次快照失败日志](logs/ui-before-chat-test-update.log)

最终轮次从当前分支取固定源码副本，界面、接口和全量检查均按这一轮记录。首次从副本用包管理器启动时，工作区部分生成的依赖链接被重写。按锁文件离线恢复，核对锁文件和依赖解析，并确认工作区已没有指向副本的依赖链接。后续在副本内直接使用同一个 verify CLI 的 Node 入口。

## 正式实例

本轮在工作树和隔离实例交付。只读查询显示正式版 `1.0.0-20261124.204123` 继续由同一 sidecar 运行，保存的旧全局上限是 3。[正式实例只读证据](artifacts/installed-read-only.json)
