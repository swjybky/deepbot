# 功能地图验收问题修复

- 时间为 2026-11-23 17:37 至 17:53:16，America/Los_Angeles（PST）。
- Git 基线为 `e332450`，在项目根目录保留工作树改动。验证实例为 `e020273f4b268f2b`，最终源码指纹为 `8d0cd89e87b9295eb68d9511c0f2e70529af1ff5661e5da8311fbbe20db39997`。
- Ubuntu 26.04.1 · Linux 7.0.0-43-generic · Node 26.13.1 · NSH 0.4.0（e626a8d）。原生截图使用私有 Xvfb 和 GTK X11，图像为 1270×790。浏览器使用无头 Chromium，场景视口为 1280×800。
- 浏览器和接口使用同一份隔离 SQLite 与真实 Node sidecar。各原生场景使用独立的新数据库和正式桌面入口。工作内容、提问和回答均为合成输入。
- 对照[第 2 到 4 轮验收](../044236-rounds-2-4/report.md)。正式证据来自本次实例的最终源码版本。
- 总结论为 **通过**。`evidence report` 返回 `passed`，`failed` 和 `missing` 均为空。[结构化报告](artifacts/report.json)

## 复现与结果

| 项目 | 入口和观察结果 | 证据 |
| --- | --- | --- |
| 例行本地时间 | 从动态页添加重复例行。场景提交无效日期 `2099-02-29` 后出现中文校验提示。改为 `2099-03-01 17:30:00` 后提示消失，弹窗列表、编辑框和动态列表的时间一致。接口读回间隔 60 分钟，时间在本机时区落在 17:30:00 | [原生弹窗](screenshots/native-bot-routines-03-routine-added.png)、[动态列表](screenshots/native-bot-routines-04-activity-local-time.png)、[快照摘录](artifacts/snapshot-projection.json) |
| 添加后的焦点 | 新增行出现后，在不重新点输入框的情况下，按 `a` 写进规矩的关键词框，按 Backspace 将例行的等待时间从 `60` 改成 `6` | [规矩原生日志](logs/native-bot-rules.log)、[例行原生日志](logs/native-bot-routines.log)、[规矩焦点](screenshots/native-bot-rules-02-rule-added.png)、[例行焦点](screenshots/native-bot-routines-02-returned-focus.png) |
| 连接不存在的文件夹 | 设置的「电脑」分区显示「文件夹不存在：/verify-missing-folder」。用接口先保存有效路径，再提交缺失路径，收到相同错误，原有效路径仍在快照中。Agent 回归也覆盖了传入普通文件的情况 | [原生提示](screenshots/native-settings-permissions-04-folder-not-found.png)、[接口错误](artifacts/folder-missing.json)、[快照摘录](artifacts/snapshot-projection.json) |
| 破坏性操作判断 | 权限开关「允许删除文件」直接拨到开启，命令未传 `--apply`。CLI 回归覆盖删除按钮、删除菜单项和停止事项仍需声明 `destructive` | [原生开关](screenshots/native-settings-permissions-03-delete-permission-on.png)、[CLI 回归](logs/control-test.log) |
| 模型按关键词调用工具 | `work-flow` 发送 `DEEPBOT_VERIFY_WORK`，事项由 Bot 自己处理，状态进入「验收中」，详情显示进度。 `attention-flow` 发送 `DEEPBOT_VERIFY_ASK`，选择「整理周报」后卡片只显示该选项。快照读回一条事项和一条已答复的提问 | [事项详情](screenshots/native-work-flow-02-work-detail.png)、[答复前](screenshots/native-attention-flow-01-open.png)、[答复后](screenshots/native-attention-flow-02-answered.png)、[快照摘录](artifacts/snapshot-projection.json) |
| 多场景视觉复核 | 报告同时记录 7 次 Chromium 和 8 次原生场景。复核输入列出了 19 张原生图，按返回顺序提交摘要。CLI 回归覆盖两次原生运行的截图同时进入复核、早先失败仍进入报告、旧源码证据被过滤 | [复核输入](artifacts/review-input.json)、[复核结果](artifacts/visual-review.json)、[截图及摘要](artifacts/screenshots.json) |
| 新增步骤与 T3 档位 | 原生侧栏右键进入重命名并回车保存。名字和人设用 `submit` 提交，浏览器协议快照读回新值。重复例行和 T3 权限档位经 `select` 修改。T3 档位仅用 `runtimeMode` 保存，响应 `ack`，CLI 回归验证重启后仍为「逐次审批」及凭据字段拒绝 | [侧栏原生日志](logs/native-sidebar-context.log)、[重命名弹窗](screenshots/native-sidebar-context-02-context-rename.png)、[T3 原生状态](screenshots/native-connectors-03-t3-mode-saved.png)、[接口回执](artifacts/t3-mode.json) |

## 自动检查

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `node scripts/check-feature-map.mjs` | 退出码 0，11 页覆盖全部 36 项 | [地图检查](logs/host-map-check.log) |
| `pnpm check` | 退出码 0，地图、防错规则、TypeScript、Clippy 和离线回归通过 | [项目检查](logs/pnpm-check.log) |
| `pnpm --silent verify check run --scope all --run "$R"` | 退出码 0，Agent 81/81、桌面 85/85，无 `unknown class` 检查命中 | [Agent](logs/agent-test.log)、[桌面](logs/ui-test.log) |
| `pnpm --silent verify check run --scope control --run "$R"` | 退出码 0，CLI 15/15 | [CLI](logs/control-test.log) |
| `pnpm --silent verify ui run <场景> --target <宿主> --run "$R"` | 15 次场景全部退出 0 | [各命令及退出码](logs/commands.log) |
| `pnpm --silent verify api call settings.update --run "$R"` | 有效路径退出 0，缺失路径按预期退出 1 | [协议片段](logs/protocol-evidence.jsonl) |

## 原生截图复核

逐张打开了复核输入的 19 张原图。弹窗内可见下一次运行时间与列表一致。规矩关键词和例行等待时间显示焦点描边。权限页两种开关呈现各自的状态，文件夹错误出现在设置弹窗的反馈浮层。事项详情显示派活对象、状态、进度和空的产物区，提问卡片答复后折叠其它选项。侧栏选择重命名后打开对应弹窗，T3 保存后的状态行显示「逐次审批」。

![原生例行弹窗的本地时间](screenshots/native-bot-routines-03-routine-added.png)

![原生文件夹错误提示](screenshots/native-settings-permissions-04-folder-not-found.png)

![原生事项详情](screenshots/native-work-flow-02-work-detail.png)

![原生提问卡片答复后](screenshots/native-attention-flow-02-answered.png)

## 验证边界

- Chromium 宿主的系统右键菜单在试跑中返回 `no context menu is open`。右键入口通过原生 `sidebar-context` 验收，`sidebar-switch` 在两种宿主均通过。
- 事项和提问来自合成模型。真实在线模型、T3 派活与审批、ACP、事项产物和用户现有桌面窗口未执行实机验收。
- 并行加入的 Clippy 检查要求合并 Rust sidecar 启动分支中的嵌套条件。早期原生试跑遇到 sidecar 启动退出，CLI 改为显式指定沙箱内的 Node 和源码入口，并保存每个原生场景的独立后台日志。最终 8 次原生运行均启动成功。复跑前只重置了本轮实例的合成数据。
- 本轮实例已停止并保留数据。验收期间的试跑实例也已停止。用户指定的旧实例数据保留。[停止回执](artifacts/stop.json)
