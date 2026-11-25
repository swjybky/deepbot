# 功能地图第 2 到 4 轮验收

- **时间** 2026-11-23 03:40 至 04:50，America/Los_Angeles（PST）。
- **目标**
  - 第 2 轮：补齐全部功能页，每条 CLI 命令实际跑一遍。
  - 第 3 轮：用新人视角随机检验 3 页。
  - 第 4 轮：在验证技能里接入功能地图，并加一个检查脚本，比对代码和地图是否一致，接进检查命令。
- **代码** Git 基线 `e332450`，含工作树未提交改动。
  - 正式报告来自实例 `4e808218c631d700`，源码指纹 `d40fb4f408a2…`，`fresh: true`。
- **环境**
  - Linux 7.0.0-43-generic，Node 26.13.1，NSH 0.4.0（e626a8d）。
  - 无头 Chromium 1280×800；私有 Xvfb/GTK X11 原生图 1270×790。
  - Xvfb 通过 `DEEPBOT_VERIFY_XVFB` 指定。
- **数据**
  - CLI 后端在开跑前执行了 `data reset --apply`，独立 SQLite，模型替身。
  - 原生场景每次使用全新数据目录。
- **总结论** 通过。`evidence report` 返回 `status: passed`，`failed` 和 `missing` 均为空。

## 第 2 轮：全部功能页

清单来源有三处，脚本从代码中提取出 36 项：

- `apps/desktop/ui/state/ui.ts` 中的 `ModalName`、`SettingsSection`、`InfoTab`、`BotConfigurationSection`，共 17 项；
- `protocol.ts` 中的 `Command`，共 19 项；
- 侧栏右键菜单。

最终分成 11 页，见[功能地图](../../../../references/features/README.md)。

| 页 | CLI 场景 | 浏览器 | 原生 | 后端读回 |
| --- | --- | --- | --- | --- |
| 创建 Bot | `create-bot` | 0 | 0 | 多出「验证助手」 |
| 侧栏管理（新增） | `sidebar-switch` | 0 | 0 | 切回小菜 |
| 聊天发消息 | `chat-send` | 0 | 0 | 一问一答 |
| 提问与审批（新增） | 无 | — | — | `attention.reply` 返回「提问已处理或不存在」 |
| 动态与事项（重写） | 无 | — | — | `work.cancel` 默认只预演，`--apply` 时返回「事项不存在」 |
| 资料库（新增） | `library-memory` | 0 | 0 | 记忆「我每周五写周报」 |
| Bot 配置、规矩与例行（新增） | `bot-rules`、`bot-routines` | 0 | 0 | 规矩「周报，日报 / self」，例行「整理周报」 |
| 模型设置 | `model-settings` | 0 | 0 | `default / 验证模型` |
| 设置（新增） | `settings-permissions` | 0 | 0 | `permissions.browser: false` |
| 连接器（新增） | `connectors` | 0 | 0 | `t3code` 显示不可用 |
| 启动、数据与重连（重写） | `env` 和 `api` 命令 | — | — | 停止后返回 `AGENT_NOT_READY`，重启后恢复 |

表中数字是退出码。补充说明：

- 浏览器和原生场景的逐条命令见 [walkthrough-all-scenarios.log](logs/walkthrough-all-scenarios.log)。
- 页面里写的 `api call` 共 33 条，逐条记录见 [api-probes.log](logs/api-probes.log)，其中 12 条是有意构造的拒绝。
- 例行 5 秒后到点，实测 `enabled` 变为 false、写入 `lastRunAt`，Bot 回复了 `DEEPBOT_VERIFY_OK`。
- 读回的数据见 [snapshot-after-scenarios.json](artifacts/snapshot-after-scenarios.json)。

![原生：规矩弹窗](screenshots/native-bot-rules-02-rule-added.png)

![原生：资料库记忆预览](screenshots/native-library-memory-02-memory-preview.png)

![原生：例行添加后](screenshots/native-bot-routines-02-routine-added.png)

![原生：权限分区](screenshots/native-settings-permissions-02-browser-off.png)

18 张原生图都实际打开看过，另外抽看了浏览器图。

## 第 3 轮：新人视角

做法：用随机种子 `1795436656` 从 11 页里抽到资料库、提问与审批、连接器三页。把这三页第 4 节的代码块原样提取出来执行，提取结果见 [artifacts/round3-*-block.sh](artifacts/round3-library-block.sh)，不加任何额外知识。运行记录见 [round3-newcomer.log](logs/round3-newcomer.log)。

- **资料库**：每条命令都成功，浏览器和原生场景都通过，读回两条记忆，删除先预演后应用。
- **提问与审批**：接口按页面所写返回「提问已处理或不存在」，`check run --scope all` 包括地图检查全部通过。这一页拿不到截图，原因页面里已写明：CLI 造不出提问卡片。
- **连接器**：浏览器和原生场景都通过，读回 T3 不可用。

![第 3 轮：只按地图走到的连接器表单](screenshots/round3/connectors-native-02-t3-editor.png)

### 发现的问题及修正

| 问题 | 怎么发现 | 修正 |
| --- | --- | --- |
| 照页面命令跑完不会停止实例，抽到的三页各留下一个运行中的实例 | 原样执行后检查实例列表 | 每页代码块末尾加 `env stop` |
| 浏览器场景和后端共用数据，在同一实例上重跑时，`library-memory` 因为出现两条同名记忆报「matches 2 pressable views」 | 在同一实例上重跑全部场景 | 场景改用 `>> nth=0`；资料库页补注意事项 |
| `bot-routines` 第二次运行失败：有例行之后，入口从「暂无例行」变成「管理例行」 | 同上，见[失败截图](screenshots/round3/routines-rerun-failed.png) | 技能和 Bot 配置页写明：重跑前先 `data reset --apply`。实测重置后再跑能通过 |
| `settings-permissions` 第二次运行会把开关拨回去，退出码仍为 0，但含义反了 | 同上 | 设置页写明：以读回的状态为准 |

## 第 4 轮：接入技能和自动检查

- **技能**：[验证技能](../../../../skills/verify/SKILL.md)新增「功能地图」一节，要求：
  - 改动前先查地图；
  - 改动影响了路径、接口、操作方式、testID 或场景，必须同步更新地图；
  - 地图里的命令必须实测过才能写。
  同时补充了 `map-check` 日志源、`FEATURE_MAP_STALE` 错误码，以及快照数据位于 `result.event.snapshot` 下这一点。
- **检查脚本**：[scripts/check-feature-map.mjs](../../../../scripts/check-feature-map.mjs) 双向比对：
  - 代码里的 36 个入口和命令，与各页「覆盖」行是否一致：代码有、地图没有的报「缺少地图」，地图有、代码没有的报已删除；
  - 场景是否存在、是否被引用；
  - README 是否链接了每一页。
- **接进检查命令**：
  - `pnpm check` 的第一步就是这个脚本，日志见 [pnpm-check.log](logs/pnpm-check.log)，退出码 0。
  - `check run` 也先跑它，日志为 `map-check.log`。不一致时返回 `FEATURE_MAP_STALE`。为此，功能地图和脚本被加进了实例的源码范围。
- **回归**：
  - 新增 `feature map check fails on an unmapped entry, a stale entry and an unused scenario`：在临时副本里加一个弹窗、删一个命令、加一个孤立场景，三处都被报出来。
  - 原来的技能命令核对，扩展到功能地图中的全部命令。临时插入 `--bogus` 时该用例失败，删掉后恢复通过。

## 自动检查

| 范围 | 结果 | 日志 |
| --- | --- | --- |
| 功能地图检查 | 11 页覆盖全部 36 项 | [map-check.log](logs/map-check.log) |
| 类型检查 | 退出码 0 | [Agent](logs/agent-types.log)、[桌面](logs/ui-types.log) |
| Agent 回归 | 80/80 | [agent-test.log](logs/agent-test.log) |
| NSH 全量桌面测试 | 85/85 | [ui-test.log](logs/ui-test.log) |
| 控制 CLI 回归 | 12/12 | [control-test.log](logs/control-test.log) |

所有日志中均无 `unknown class`。

## 截图中看到、尚未修复的应用问题

以下问题已写进对应地图页，没有改代码：

- 例行列表里的时间是英文 12 小时制，例如「11/23/2026, 5:37:09 AM」；「下次运行时间」输入框却是 UTC 的 ISO 字符串，例如「2026-11-23T13:37:09.600Z」。
- 添加规矩或例行后，焦点跳到别的输入框，没有回到添加表单的第一个输入框。
- 连接文件夹时，如果路径不存在，后端直接返回 Node 原始错误 `ENOENT: no such file or directory, realpath …`，没有转成中文提示。

## 边界与未验证

- **正式视觉复核只覆盖最后一次原生运行。** `evidence report` 每种目标只记录最后一次，所以正式复核只包括 `bot-rules` 的两张图。另外 16 张原生图是我手动看的，来自同一实例的上一次完整运行；那次与最终运行之间，只多改了 Bot 配置页的一段注意事项。
- **CLI 造不出事项和提问卡片。** 这两页的界面只能靠 `check run` 里的前端和后端回归测试来验证。
- **以下操作这一轮没有用 CLI 走过**：
  - 右键菜单
  - 拖拽
  - 下拉选择
  - 回车提交（名字、人设）
  - `connector.t3.configure`：这条命令被 CLI 拦截
  - 原生窗口里的重连
- **新人视角是我按页面原样执行命令来模拟的**，没有另起一个不带上下文的 agent。
- 本轮建立的实例 `4e80…`、`b246…`、`e5cd…`、`937e…` 都已停止，数据还保留着，没有删除。
