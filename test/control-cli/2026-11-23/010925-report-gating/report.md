# 控制 CLI 报告判定修复验收

- **时间** 2026-11-23 01:05 至 01:12，America/Los_Angeles（PST）。
- **目标** 修复上一轮（四层流程验收，报告已删除）流程复查发现的问题，并用修复后的 CLI 从 `env start` 起完整重跑。
- **代码** Git 基线 `e332450`，含工作树未提交改动。全部证据来自同一实例 `8f2c1859b6935b86`，源码指纹 `d9fb71549429…`。生成报告时 CLI 重算了工作区指纹，结果一致（`fresh: true`）。
- **环境** Linux 7.0.0-43-generic，Node 26.13.1，NSH 0.4.0（e626a8d），Rust 1.98.1。无头 Chromium 1280×800，私有 Xvfb/GTK X11 原生图 1270×790。本机未安装 Xvfb，本轮通过 `DEEPBOT_VERIFY_XVFB` 使用从 Ubuntu `xvfb 2:21.1.22-1ubuntu1.3` 包解出的二进制（`/var/tmp/deepbot-xvfb.QQmuTl/`，deb SHA-256 `e46d389e…`）。
- **数据** 独立 SQLite、默认「小菜」、合成模型 `verify-local` 和本地模型替身。原生入口用自己的独立数据目录启动真实后端。
- **总结论** 通过。`evidence report` 返回 `status: passed`，`failed` 和 `missing` 均为空。

## 本次修复

| 问题 | 修复 | 回归 |
| --- | --- | --- |
| 报告不检查代码之后是否又有改动 | `evidence report` 和 `env status` 重算工作区指纹，与实例指纹不一致时 `status: stale` | `source edited after staging marks the report stale`，以及暂存指纹与工作区指纹一致 |
| 界面场景失败时视觉状态仍可通过 | 场景失败时 `visualStatus` 和 `status` 都为 `failed` | `a failed native scenario fails the report even with a passed review` |
| `check run` 的新结果覆盖其他范围 | 按 agent、ui 两部分分别记录，报告缺一部分即 `incomplete` | `review for other images and partial checks leave the report incomplete` |
| 报告没有总体结论 | 新增 `status`、`failed` 和 `missing`，缺原生运行或复核时列出缺项 | `missing native run is reported as missing, not passed`，以及全部通过时为 `passed` |
| 保存后的界面断言可被输入框文字满足 | 场景改为先等 `id:model-editor` 消失，再找新名称 | 本轮浏览器和原生运行 |
| Ctrl-C 或进程被杀后实例锁不释放 | 收到 SIGINT 或 SIGTERM 时释放锁。锁中 pid 已不存在时，下一条命令回收 | `a lock left by a killed CLI is reclaimed, a live one is refused`，另手动中断 `check run`：退出码 130，锁已移除 |
| CLI 与 worker 超时不一致 | 单个子进程上限统一为 15 分钟，CLI 等待 `check run` 的时间为 4 个子进程之和加 1 分钟，超时单独报 `UI_TIMEOUT`、`CHECK_TIMEOUT` | 未构造超时场景，代码审阅 |

## 操作与证据

| 验收项 | 实际结果 | 证据 |
| --- | --- | --- |
| 无头浏览器实际操作 | 侧栏进入模型设置，展开 OpenAI，编辑并保存为「验证模型」，编辑器消失后列表显示新名称。`api snapshot` 读回 `default / 验证模型` | [浏览器日志](logs/ui-browser.log)、[浏览器截图](screenshots/03-model-saved-browser.png) |
| 后端协议和本地模型 | `model.test` 返回连接成功，`message.send` 得到 ack，快照中读回回复 `DEEPBOT_VERIFY_OK` | [后端证据](artifacts/backend-probe.json) |
| 原生正式入口实际操作 | 第一次运行因沙箱中没有 Xvfb 返回 `NATIVE_DISPLAY_MISSING`（退出码 3）。设置 `DEEPBOT_VERIFY_XVFB` 后执行 `env restart --scope all`，同一场景通过并读回模型文件，用时 1 分 23 秒 | [原生日志](logs/ui-native.log) |
| 视觉复核 | 实际打开了三张原生图，按弹窗、输入、保存后状态、中文字形四项检查，复核与图片哈希对应 | [复核输入](artifacts/review-input.json)、[复核结果](artifacts/visual-review.json) |
| 报告判定 | 保存复核前为 `incomplete`，缺 `visual-review`。保存后为 `passed` | [CLI 报告](artifacts/cli-report.json) |

三张原生图的 SHA-256 与上一轮完全一致，说明在同一环境中渲染稳定。

![编辑模型时的原生界面](screenshots/02-model-editor-native.png)

![保存后的原生界面](screenshots/03-model-saved-native.png)

## 自动检查

| 命令或范围 | 结果 | 日志 |
| --- | --- | --- |
| 控制 CLI 自身回归 `node --test tools/control/cli.test.mjs` | 9/9 | [CLI 测试](logs/control-test.log) |
| `check run --scope all`：Agent 与桌面类型检查 | 退出码 0 | [Agent](logs/agent-types.log)、[桌面](logs/ui-types.log) |
| `check run --scope all`：Agent 回归 | 80/80 | [Agent 测试](logs/agent-test.log) |
| `check run --scope all`：NSH 全量桌面测试 | 85/85 | [桌面测试](logs/ui-test.log) |

所有日志均无 `unknown class`。检查结果按 agent 和 ui 两部分写入 CLI 报告，都绑定同一源码指纹。

## 边界与未修复项

- 视觉复核仍由执行验证的 Agent 自己填写，CLI 只能确认复核对应的是当前图片。
- 原生场景每次使用全新数据目录，看不到 `api call` 造的数据，也无法在原生窗口验证重启后的持久化。
- CLI 只能从当前工作区建实例。取修改前参照图需要另起一份旧代码，目前没有 `--ref` 之类的支持。
- 「仅重载 UI 后端代次不变」的回归不能真正证明什么，因为代次在 worker 启动时就固定了。
- 旧实例不会自动清理，也没有列出实例的命令。
- Wayland、真实模型和真实 T3/ACP 在本轮未验证。
