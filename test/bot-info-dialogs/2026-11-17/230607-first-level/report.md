# Bot 信息栏一级页面与弹窗验证

- **时间与验证人**　2026-11-17 23:06–23:09，PST（UTC−08:00），Codex
- **代码**　`e3324505148f078e06725ca8b29470865efc6eb1` 工作区。范围为 Bot 信息栏、事项和配置弹窗、共用 ModalHeader、弹窗状态、产物预览复用及对应回归。工作区还包含其他已有改动。
- **环境**　Ubuntu 26.04.1，NSH 0.4.0 (e626a8d)，默认 GTK Wayland，1280×800 原生窗口，右栏 320px 及实拖至 240px，系统文字比例 1.0，Noto Sans。
- **数据**　事项及产物使用隔离协议 Fixture。规矩和例行由正式 App 入口和实际 Node sidecar 验证，数据及 Bot 工作区在隔离临时目录。
- **总结论**　类型检查、80 项桌面测试、正式 App 规矩和例行的保存与重启、原生事项弹窗交互和截图比较通过。当前用户窗口的刷新状态待确认。

## 复现与预期

1. 打开右栏「动态」，分别点进行中与已结束事项。目标、验收、执行者、进度和产物在全窗口弹窗阅读。未结束事项显示停止图标，完成或停止后移除。关闭后原列表与「已结束」展开状态保留，顶部叉号仍可单独关闭右栏。
2. 在事项详情点击产物，在同一弹窗预览，返回箭头回到事项，关闭关闭整个弹窗。资料库的资料和记忆继续直接开启预览。
3. 从「配置」打开「规矩」和「例行」，从「动态」的「暂无例行」或「管理例行」打开同一个例行弹窗。关闭后保留来源 Tab。全局设置保留六个全局分类。
4. 在正式 App 中暂停第一只 Bot 的已存规矩，编辑它的已存例行，切换第二只 Bot 新增规矩和例行。重启隔离 sidecar，快照应保留旧条目 ID、编辑结果与新数据的 Bot 归属。

## 检查结果

| 命令或场景 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm check` | 退出 0 | [类型与 Rust](logs/check.log) |
| `nsh test apps/desktop` | 80/80，退出 0 | [全量 headless](logs/headless.log) |
| 事项与例行专题 headless | 5/5、2/2 | [事项](logs/work-headless.log)、[例行](logs/routine-headless.log) |
| Linux 原生事项详情 | 1/1，从事项列表打开两种状态、展开目标及进度、关闭后保留已结束组、拖至 240px | [列表与详情](logs/work-native.log) |
| Linux 原生事项产物预览、返回、停止 | 1/1，预先用 Fixture 打开事项，原生点击预览、返回、停止和关闭 | [产物与停止](logs/preview-stop-native.log) |
| 正式 App 原生规矩与例行 | 1/1，从动态与配置打开、编辑、切换 Bot、添加、关闭后回到原 Tab | [原生配置](logs/config-native.log) |
| 真实 sidecar 重启取快照 | 退出 0，记录、归属和 ID 验证通过 | [预置记录](logs/sidecar-seed.log)、[重启结果](logs/sidecar-restart.log) |

本轮日志无 `unknown class`。隔离 sidecar 的 T3 端点指向未监听的本地端口，探测失败符合该环境设置。事项执行和停止验证使用 Fixture 的状态与命令投影，未停止真实运行中的事项，也未触发在线模型或定时任务。

## 原生截图与实际对比

| 检查项 | 修改前 | 修改后及观察 |
| --- | --- | --- |
| 事项阅读和关闭 | [右栏内的旧版详情](../../../work-list/2026-11-17/223917-without-arrows/screenshots/04-running-detail.png) | [进行中](screenshots/work-activity-detail-w1.png) 和 [已结束](screenshots/work-activity-detail-done.png) 改用 760px 弹窗。同一测试长标题在弹窗内使用一行，目标和进度展开完整，执行区仍可看到目录与改派。已结束页眉只显示关闭。右栏列表保留在遮罩下 |
| 停止与窄栏 | 原来停止位于右栏详情返回旁 | [停止后的弹窗](screenshots/deepbot-cards-ended.png) 含状态「已取消」并收去停止按钮。[窄栏原图](screenshots/work-activity-narrow.png) 的列表仍显示单行标题及运行圆点 |
| 规矩 | [右栏内的规矩](../../../bot-configuration/2026-11-17/224753-bot-rules-routines.07d5d8/screenshots/rules.png) | [规矩弹窗](screenshots/rules.png) 标题带 Bot 名，表单及开关对齐，首屏可见新增区；配置入口仍在右栏 |
| 例行 | [窄栏内的例行](../../../bot-configuration/2026-11-17/224753-bot-rules-routines.07d5d8/screenshots/routine-narrow.png) | [例行弹窗](screenshots/routine.png) 可看完整时间值和等待单位。新增区底部按内容滚动，标题和关闭按钮留在顶部；原动态列表在遮罩下保持原位 |

已实际打开原生截图并比较。不同 Bot 数据或捕获时间造成文案与时间值变化。开发服务已返回新版 bundle，现有宿主保持连接，未直接操作用户正在使用的窗口。

![事项详情、规矩与例行弹窗](screenshots/dialogs.png)
