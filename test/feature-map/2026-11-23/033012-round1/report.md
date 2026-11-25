# 功能地图第 1 轮验收

- **时间** 2026-11-23 03:16 至 03:30，America/Los_Angeles（PST）。
- **目标**
  - 把[功能地图](../../../../references/features/README.md)改成五节格式：功能说明、用户路径、前后端对应、CLI 驱动、注意事项。
  - 先做三个核心功能：创建 Bot、聊天发消息、模型设置。
  - 每条 CLI 命令都实际跑过。
- **代码** Git 基线 `e332450`，含工作树未提交改动。
  - 本轮改动：
    - `references/features/` 下的 README、create-bot、chat、model-settings 四份文件；
    - 新增场景 `tools/control/scenarios/create-bot.json` 和 `chat-send.json`。
  - 全部证据来自实例 `ff4a7c0a43883f7f`，源码指纹 `1d2bd5743eaf…`，`fresh: true`。
- **环境**
  - 系统：Linux 7.0.0-43-generic，Node 26.13.1，NSH 0.4.0（e626a8d）。
  - 无头 Chromium 1280×800；私有 Xvfb/GTK X11 原生图 1270×790。
  - Xvfb 仍用 `DEEPBOT_VERIFY_XVFB` 指向之前解包的二进制。
- **数据**
  - CLI 后端：独立 SQLite，默认「小菜」，本地模型替身。
  - 原生场景：每次用全新数据目录。
- **总结论** 通过。`evidence report` 返回 `status: passed`，`failed` 和 `missing` 均为空。

## 第一层复核

| 要求 | 实测 |
| --- | --- |
| 只看技能就能启动、打开页面、截图、看报错 | 本轮从 `env doctor`、`env start` 到报告，全程只用技能里写的命令。应用本身没有登录。`fresh` 检查生效：先改场景、后跑报告，得到的是 `stale`，按技能执行 `env restart --scope all` 后重跑才通过 |
| 后端没启动、端口被占时，报错能指路 | 实例停止后执行 `api call`、`ui run`，返回 `AGENT_NOT_READY`，退出码 3，nextAction 为「看 worker/agent 日志再 env restart --scope all」。照做后恢复。`ui serve --port` 遇到已占用端口，返回 `SERVE_PORT_FAILED` 和「换一个 --port，或去掉它」。runId 写错时返回 `RUN_NOT_FOUND` |
| 用它完成过真实小任务 | 之前做的报告判定修复、`ui serve`、旧机制清理都靠它验证。本轮又用它走通了三个功能，并发现地图要写的坑。还没有用它验证过一次产品功能改动，这一项只能算部分满足 |

## 操作与证据

逐条命令和退出码见 [walkthrough.log](logs/walkthrough.log)。两条退出码为 1 的命令是有意构造的拒绝：

- 删除默认模型被保护拒绝；
- `threadId` 写错被拒绝。

| 功能 | 浏览器场景 | 原生场景 | 后端读回 |
| --- | --- | --- | --- |
| 创建 Bot | 退出码 0 | 退出码 0 | 新 Bot `验证助手 / hex / #2183F2 / default`，`threadId` 为 `dm:<id>` |
| 聊天发消息 | 退出码 0 | 退出码 0 | `dm:xiaocai` 中有 `person: 你好，验证一下` 和 `bot: DEEPBOT_VERIFY_OK` |
| 模型设置 | 退出码 0 | 退出码 0，场景核对了 `models.json` | `default / 验证模型` |
| 接口补充 | — | — | `model.test` 返回连接成功。`model.delete --apply` 返回保护说明。`message.send` 用错 `threadId` 时返回「Bot 与会话不匹配」 |

读回数据见 [snapshot-readback.json](artifacts/snapshot-readback.json)，CLI 报告见 [cli-report.json](artifacts/cli-report.json)，视觉复核见 [visual-review.json](artifacts/visual-review.json)。

![原生：创建 Bot 弹窗](screenshots/native-create-bot-01-create-dialog.png)

![原生：创建后切到新 Bot](screenshots/native-create-bot-02-bot-created.png)

![原生：发送后收到回复](screenshots/native-chat-send-02-replied.png)

![原生：模型保存后](screenshots/native-model-settings-03-model-saved.png)

十张截图都实际打开看过。

- 原生图与本轮第一次运行逐字节一致，与之前几轮模型设置的三张图也一致。
- 原生创建 Bot 的结果：形状网格为 5+5+3，选中项有细边框，颜色选中项有双圈。创建后侧栏和头部都切到「验证助手」。
- 原生聊天的结果：右侧是 Bot 颜色的气泡，左侧是灰底回复，中文正常。

## 自动检查

| 范围 | 结果 | 日志 |
| --- | --- | --- |
| `check run --scope all` 类型检查 | 退出码 0 | [Agent](logs/agent-types.log)、[桌面](logs/ui-types.log) |
| Agent 回归 | 80/80 | [agent-test.log](logs/agent-test.log) |
| NSH 全量桌面测试 | 85/85 | [ui-test.log](logs/ui-test.log) |

所有日志中均无 `unknown class`。

## 本轮发现，已写进地图

- `api snapshot` 的数据在 `result.event.snapshot` 下，技能里没写，地图的读回命令里补上了。
- 新 Bot 的 id 每次随机生成，不能用 `id:` 定位；名字可以重复。
- `message.send` 的 ack 早于回复：有 1.2 秒合并窗口，连续几条消息会被并成一批。
- 一句单独的「同意 / 拒绝」类词语，可能被当作审批回复。
- 项目没有为每个功能单独建表。状态都在 pi-durable 的 `documents` 表里，属于 `deepbot.ledger` 文档；模型配置单独存放在 `models.json`。

## 边界与未验证

- `evidence report` 每个目标只记录最后一次运行。所以正式视觉复核只覆盖模型设置的原生图，创建 Bot 和聊天的原生图是我手动看的，不在报告里。
- 创建 Bot 的模型下拉框、侧栏右键菜单、悬停回复、回车发送，都没有在本轮用 CLI 走过。
- 「后端拒绝后界面回退到第一个 Bot」是读代码得出的，没有实测。
- 真实模型、拉取模型列表、真实密钥未验证。
