# 动态事项与例行验证

- **时间与验证人**　2026-11-17 22:39–22:41 PST（UTC−08:00），Codex
- **目标**　事项单行标题，执行中显示动画，「已结束」置底且默认收起，事项和例行条目省去提示图标。
- **代码**　`e3324505148f078e06725ca8b29470865efc6eb1` 工作区。改动涉及 `BotInfoPanel`、`ActivityCard`、`ActionRow`、`DisclosureRow`、图标表和共用的 `PulsingDots`，更新事项与例行回归。
- **环境**　Ubuntu 26.04.1、Linux 7.0.0-43-generic、NSH 0.4.0 (e626a8d)、默认 GTK Wayland、NSH 测试驱动点击，窗口 1280×800，默认右栏 320px，最窄 240px，1×，Noto Sans，系统动效开启。
- **数据**　隔离协议 Fixture，构造执行中与已结束事项，并分别使用空例行及有例行的数据。
- **参照**　[原布局原生截图](../223710-activity/screenshots/01-before.png)、[首轮带进入箭头版本](../223710-activity/screenshots/02-after-frame-2.png)。
- **总结论**　类型与全量 headless 通过。Linux 原生隔离窗口的列表显示、圆点动画、折叠与详情、例行入口和窄栏均通过。现有用户窗口加载待确认。

## 复现与预期

1. 打开 Bot 信息的动态 Tab，依次看到事项、即将进行、电脑、已结束。
2. 核对折叠初始态，点「已结束」展开并进入已交付事项详情。返回后收起，确认事项隐藏。
3. 提交执行阶段变化，核对圆点仅在运行阶段显示，已结束事项按状态移组。窄栏内长标题单行省略。
4. 查看「暂无例行」和「管理例行」的原生显示及入口。空、有数据、开关与 Bot 切换分别验证。

## 代码检查

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm check` | 退出 0 | [类型与 Rust](logs/check.log) |
| `nsh test apps/desktop` | 退出 0，76/76 通过 | [全量 headless](logs/headless.log) |
| `nsh test apps/desktop --target linux --filter 'work list shows title-only'` | 1/1 通过 | [事项原生](logs/native-work-list.log) |
| `nsh test apps/desktop --target linux --filter 'bot info activity tab'` | 1/1 通过 | [有例行原生](logs/native-routines.log) |
| `nsh test apps/desktop --target linux --filter 'routine empty card opens management'` | 首次在 Bot 胶囊点击后等待面板超时。预开面板后 1/1 通过 | [首次](logs/native-routines-interaction.log)、[预开复测](logs/native-routines-retry.log) |

所有本轮日志均无 `unknown class` 警告。

## 原生截图与实际对比

| 检查项 | 参照 | 实际查看与对比 | 结论 |
| --- | --- | --- | --- |
| 动态默认布局 | [旧版](../223710-activity/screenshots/01-before.png) | [默认折叠](screenshots/02-collapsed-2.png) 中，事项标题单行省略，右侧圆点替换状态文字。「已结束」位于「电脑」下方，箭头向下 | 通过 |
| 事项和例行提示图标 | [首轮](../223710-activity/screenshots/02-after-frame-2.png) 的事项行带进入箭头，空例行带时钟和进入箭头 | [最终折叠](screenshots/02-collapsed-2.png)、[最终展开](screenshots/03-expanded.png) 中，执行中事项右侧只显示圆点，已结束事项卡片仅显示标题。「暂无例行」为纯文字卡片 | 通过 |
| 已结束展开与详情 | 原布局直接显示已结束及进度 | [展开](screenshots/03-expanded.png) 后箭头向上。两组都能点进详情，分别核对 [执行中详情](screenshots/04-running-detail.png) 与 [已结束详情](screenshots/05-ended-detail.png) | 通过 |
| 圆点动画 | 原布局显示「执行中」文字 | [关键帧 1](screenshots/02-collapsed-1.png)、[关键帧 2](screenshots/02-collapsed-2.png)、[关键帧 3](screenshots/02-collapsed-3.png) 中圆点依次变化。连续两对帧圆点区域分别变化 60 和 144 像素，其他动态页内容保持稳定。[像素记录](logs/animation-pixels.log) | 通过 |
| 240px 窄栏 | 默认 320px | 实际拖窄后，[长标题仍在单行截断](screenshots/06-narrow.png)，三个圆点完整显示 | 通过 |
| 有例行的布局与交互 | 旧版例行和管理入口使用时钟 | [有例行](screenshots/07-routines.png) 中显示名称、时间与开关，管理行只显示文字。预开原生面板后可打开设置、添加、调用开关、再次从管理行打开并切换 Bot | 通过 |

已实际查看最终默认折叠、展开、详情、窄栏、有例行和三张动效关键帧。原图为同一环境的 1280×800 窗口，窄栏由测试拖动分隔线得到。

## 真实业务与复验范围

- 测试在 Fixture 协议数据上验证原生列表点击、例行管理和命令投影。用户的现有窗口及真实 Bot 数据未单独验收。
- 本机开发服务返回含最终版折叠标识的 bundle，现有宿主与该服务保持连接。旧窗口是否完成热加载待确认。
- 原生完整例行入口在 Bot 胶囊处首次超时，符合 [ERR-006 的既有输入现象](../../../../error/linux-native-input.md)。预开面板复测覆盖了本次改动的卡片交互；全量 headless 仍覆盖 Bot 胶囊打开面板。

## 交付截图

对话展示 [默认折叠](screenshots/08-panel-collapsed.png) 和 [展开后](screenshots/09-panel-expanded.png)。两张均裁自本次原生原图。
