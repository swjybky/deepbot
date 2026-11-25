# Bot 规矩和例行迁到配置页

- **时间与验证人**　2026-11-17 22:47 起，PST（UTC−08:00），Codex
- **代码**　`e3324505148f078e06725ca8b29470865efc6eb1` 工作区。涉及 `BotInfoPanel`、`BotConfiguration`、迁入的 `RuleConfiguration` 和 `RoutineConfiguration`、设置分类、测试协议 Fixture 和相应回归。工作区还有其他已有改动。
- **环境**　Ubuntu 26.04.1，NSH 0.4.0 (e626a8d)，默认 GTK Wayland。1280×800 窗口，右栏 320px 及实拖至 240px，系统文字比例 1.0，Noto Sans。
- **数据**　现有基线用隔离 Fixture。最终原生操作由正式 `App.tsx` 和实际 Node sidecar 完成，数据根目录和 Bot 工作区均在隔离临时目录。测试提前写入一条已有规矩和一条例行，T3 端点指向未监听的本地端口，例行安排到未来。

## 复现与预期

1. 从顶部 Bot 胶囊打开右栏，选「配置」。首屏可见「规矩」「例行」。点整行进入对应表单，返回箭头回到配置，顶部叉号仍关闭整个面板。
2. 在「动态」核对已有例行的时间、开关和「管理例行」，以及空 Bot 的「暂无例行」。两个管理入口都进入当前 Bot 的例行配置。
3. 在小菜的规矩页暂停已有规矩，再修改已有例行的任务。切换 Bot 后只显示该 Bot 的数据，另行添加一条规矩、一条例行，重启 sidecar 读回并核对两组记录及 ID。
4. 打开账户设置，核对全局导航仅有通用、模型、执行器、电脑、权限与连接器。headless 另覆盖切换 Bot 丢弃未提交规矩草稿。

## 代码与业务检查

| 命令或用例 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm check` | 退出 0 | [类型与 Rust](logs/final-layout-check.log) |
| 规矩及例行迁移专题 headless | 1/1 与 2/2 通过 | [规矩](logs/rules-headless.log)、[例行](logs/routines-headless.log) |
| `pnpm --filter @deepbot/agent test` | 退出 0，70/70 通过 | [后端回归](logs/agent.log) |
| 真实 `App.tsx` 进行原生点击、输入和保存 | 退出 0，1/1 通过 | [Linux 原生](logs/final-layout-native.log) |
| 真实 sidecar 关闭并重启，再取全量快照 | 退出 0。两条旧记录 ID 保留，原生界面上的编辑已持久化，两个新条目均属于第二个 Bot | [隔离种子数据](logs/final-layout-seed.log)、[重启核对](logs/final-layout-restart.log) |

原生回归首次在 Fixture 的「暂无例行」点击后等待 `routine-name` 超时，正式 App 中同一个入口实测可达。最终构建的 Fixture 原生复验 1/1 通过，覆盖空卡片、有例行时的管理行、动态开关及 Bot 切换。见 [首次尝试](logs/routines-native.log) 和 [复验](logs/routines-native-retry.log)。

隔离验证覆盖配置读写、Bot 归属与复位，未发起在线模型调用、T3 派活或定时触发。sidecar 日志里的连接器探测失败来自隔离用的本地空端点。

## 原生截图与实际对比

| 检查项 | 参照 | 实际查看结果 |
| --- | --- | --- |
| 配置入口 | [首轮原生截图](screenshots/first-pass/configuration.png) 中入口位于文件夹下方，被首屏裁掉 | [最终配置](screenshots/configuration.png) 中行卡片位于模型下方、文件夹上方，间距及左右边缘与现有控件对齐，首屏均可点击 |
| 规矩列表、表单与返回 | 配置宽度及返回导航约束 | [320px](screenshots/rules.png) 和 [240px](screenshots/rules-narrow.png) 中返回箭头位于 Tab 下方，独立于顶部关闭。中文标签和派活对象下拉均留在面板内 |
| 例行既有记录与新增 | [上一轮的窄栏空态](screenshots/second-pass/routine-empty.png) 中默认值 60 没有可见单位 | [最终窄栏空态](screenshots/routine-empty.png) 显示「等待时间（分钟）」。[已有记录](screenshots/routine-narrow.png) 的卡片和控件留在右栏内。长 ISO 时间在单行输入内横向裁切，页面可纵向滚动访问下方的新增表单 |
| 动态快捷入口 | [修改前原生 Fixture](screenshots/01-before.png) 中「暂无例行」打开设置 | [同尺寸、同 Fixture 的最终卡片](screenshots/02-after-activity.png) 保留宽度、描边与文案，点入右侧配置；列表有数据时从管理行打开 [已保存例行](screenshots/fixture-saved-routine.png)。正式 App 同时记录了 [有例行](screenshots/activity.png) 与 [空态](screenshots/activity-empty.png) |
| 全局设置 | 原有独立分类「规矩」「例行」 | [最终设置](screenshots/settings.png) 仅有六项全局分类 |

已实际打开最终配置、原生动态、规矩、例行和设置截图。对话展示的三栏图由最终原生窗口的右栏裁切拼接。开发服务已提供新版 bundle，已有桌面宿主仍与服务连接，未直接操作用户的现有窗口。

![Bot 配置首页、规矩详情、例行详情](screenshots/bot-config.png)
