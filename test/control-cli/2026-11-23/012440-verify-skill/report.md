# 验证技能与 ui serve 验收

- **时间** 2026-11-23 01:24 至 01:35，America/Los_Angeles（PST）。
- **目标** 重写 [verify 技能](../../../../skills/verify/SKILL.md)，给 CLI 加 `ui serve` 和 `ui close`，让浏览器工具能操作连接测试后端的网页。然后以没见过本项目的 agent 视角，只照技能文件走完整个验证流程。
- **代码** Git 基线 `e332450`，含工作树未提交改动。全部证据来自实例 `daa8d1d513604c25`，源码指纹 `08d7d5df97d0…`。生成报告时 `fresh: true`。
- **环境** Linux 7.0.0-43-generic，Node 26.13.1，NSH 0.4.0（e626a8d），Rust 1.98.1。CLI 内无头 Chromium 为 1280×800，T3 浏览器预览为 1280×800，私有 Xvfb/GTK X11 原生图为 1270×790。Xvfb 与[上一轮](../010925-report-gating/report.md)相同，是从 Ubuntu `xvfb 2:21.1.22-1ubuntu1.3` 包解出的二进制。
- **数据** 独立 SQLite、默认「小菜」、合成 Bot「验证 Bot」、合成模型 `verify-local` 和本地模型替身。
- **总结论** 通过。`evidence report` 返回 `status: passed`，`failed` 和 `missing` 均为空。

## 新视角复查发现并已修正的问题

只按技能文件执行时，发现以下问题：

| 问题 | 处理 |
| --- | --- |
| 技能没说怎么从 `env start` 的 JSON 取出 runId | 给出 `R=$(… \| node -pe …)` 一行命令 |
| 没说如何按顺序拿到截图摘要，`review-save` 无从下手 | 给出列出 `sha256  路径` 的一行命令 |
| `api call` 实际只放行 18 种类型，技能未列出 | 列出全部类型。其他类型返回 `COMMAND_INVALID`，按浏览器兜底处理 |
| 改了 `tools/control` 后该用哪个重启范围，技能没写 | 改为「只改 `apps/desktop` 用 `ui`，其他一律 `all`」，并说明 `env status` 的 `fresh` 字段 |
| 缺 Xvfb 时 `env doctor` 直接省略 `xvfb` 字段，`DEEPBOT_VERIFY_XVFB=` 为空时返回空串 | CLI 统一返回 `null`，回归中断言字段齐全 |
| `NATIVE_DISPLAY_MISSING` 的 nextAction 只说安装，不提 `DEEPBOT_VERIFY_XVFB`，也没说重启范围 | 改为两种办法加 `env restart --scope all` |
| 浏览器工具中紧跟输入后的第一次回车丢失 | 技能要求每个动作后都等页面出现预期变化，没变化就对目标控件重做并记录 |
| 首次原生运行要编译 Rust，耗时不明 | 在命令注释中说明 |
| 示例场景名会被误当成固定写法 | 注明换成覆盖本次改动的场景 |

另外新增回归 `every command and flag in the verify skill exists in the CLI help`，技能里引用了不存在的命令或参数时测试失败。在技能里临时插入 `--bogus`，该用例按预期失败，删掉后恢复通过。

## 照技能走完一遍

逐条命令、输出和退出码见 [walkthrough.log](logs/walkthrough.log)，共 28 条。只有以下两条退出码非零，都在预期之内：

- `ui run --target native` 退出码 3（`NATIVE_DISPLAY_MISSING`）。shell 中未设置 Xvfb，按技能设置 `DEEPBOT_VERIFY_XVFB` 并执行 `env restart --scope all` 后通过。
- `api call connector.t3.configure` 退出码 1（`COMMAND_INVALID`），用于确认不支持的类型按技能所写方式报错。

| 验收项 | 实际结果 | 证据 |
| --- | --- | --- |
| 无头浏览器场景 | 模型改名并保存，编辑器消失后列表显示「验证模型」，`api snapshot` 读回 `default / 验证模型` | [浏览器日志](logs/ui-browser.log)、[截图](screenshots/03-model-saved-browser.png) |
| 「常见用法」中的接口示例 | `bot.upsert` 得到 ack。`message.send` 得到 ack，回复为 `DEEPBOT_VERIFY_OK`。`model.test` 返回连接成功。`bot.delete --dry-run` 返回 `writes: false`，Bot 仍在。按 requestId 读到协议日志 | [发消息](artifacts/message-send.json)、[模型测试](artifacts/model-test.json)、[快照](artifacts/snapshot-after-api.json) |
| 浏览器工具兜底 | `ui serve` 返回 127.0.0.1 上的 `url`。T3 预览打开后先看到 API 造的「验证 Bot」和「你好」对话，说明两边共用同一份数据。输入后按回车发送（场景步骤做不到），得到回复。CLI 读回 `desktop-` 开头的请求 ID 及其 ack。`ui close` 后端口不可达 | [截图](screenshots/04-browser-tool-enter-send.png)、[读回](artifacts/browser-tool-readback.json)、[网页日志](logs/ui-serve.log) |
| 原生正式入口 | 同一场景在私有 X11 中通过，并读回模型文件 | [原生日志](logs/ui-native.log) |
| 视觉复核 | 实际打开了三张原生图，按弹窗、输入、保存后状态、中文字形四项检查 | [复核](artifacts/visual-review.json) |
| 报告 | `status: passed`，`fresh: true` | [CLI 报告](artifacts/cli-report.json) |
| 收尾 | `env stop` 后先预演 `data delete`，再执行 `--apply` | [walkthrough.log](logs/walkthrough.log) |

![浏览器工具回车发送后的网页](screenshots/04-browser-tool-enter-send.png)

![保存后的原生界面](screenshots/03-model-saved-native.png)

浏览器工具截图来自 Web 宿主，不计入 `evidence report`，只作为补充证据。

## 自动检查

| 命令或范围 | 结果 | 日志 |
| --- | --- | --- |
| `node --test tools/control/cli.test.mjs` | 11/11，含技能命令核对和 `ui serve` 的回环与拒绝删除检查 | [CLI 测试](logs/control-test.log) |
| `check run --scope all`：类型检查 | 退出码 0 | [Agent](logs/agent-types.log)、[桌面](logs/ui-types.log) |
| `check run --scope all`：Agent 回归 | 80/80 | [Agent 测试](logs/agent-test.log) |
| `check run --scope all`：NSH 全量桌面测试 | 85/85 | [桌面测试](logs/ui-test.log) |

所有日志均无 `unknown class`。

## 建议加进 CLI 的操作

这次浏览器兜底中的「输入后按回车提交」，目前的场景步骤表达不了。建议新增场景步骤 `{"submit": "id:<testID>"}`，对应 NSH 测试 API 的 `app.submit()`。用户同意前未实现。

## 边界

- 「从没见过本项目的 agent」是由我按技能逐条执行来模拟的，没有另起一个不带上下文的 agent。
- `ui serve` 的网页不会热更新，改代码后需重启实例并重新 serve。
- 宿主端口只监听 127.0.0.1，但本机其他进程也能访问这份测试后端（仅含合成数据，删除类操作默认被拒绝）。
- 视觉复核仍由执行验证的 agent 自己填写。原生场景仍使用独立的空白数据。
- 旧实例目录未自动清理。上一个实例 `c34219d333685339` 的数据已删除，但目录还在，因为删除命令被安全检查拦下了。
- Wayland、真实模型和真实 T3/ACP 未验证。
