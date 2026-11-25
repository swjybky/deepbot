# 右侧 Bot 信息面板图标操作与记忆迁移 验证记录

- 时间与时区：2026-11-16 02:01–02:10 PST
- 验证人：Claude（Claude Code）
- 目标/触发条件：用户要求右侧「动态 / 资料库 / 配置」的按钮全部改成图标；针对条目的图标与条目同行；整个模块的操作用占位样式代替按钮；记忆从设置窗口移到每个 Bot 的「资料库」列表下管理
- 代码：Git SHA e332450，工作区大量未提交改动（仓库既有）。本次差异文件：`apps/desktop/ui/theme/icons.ts`、`components/IconButton.tsx`、`components/ActivityCard.tsx`、`components/AutoField.tsx`、`features/bot-info/{ArtifactCard,BotConfiguration,BotInfoPanel}.tsx`、`features/settings/SettingsDialog.tsx`、`state/ui.ts`，删除 `features/settings/sections/MemorySettings.tsx`；`FixtureApp.tsx`（`panelActions`、`infoTab` 参数）、`tests/panel-actions.test.tsx`（新）、`tests/shell.test.tsx`；文档 `DESIGN.md`、`design/components/{button,list}.md`、`error/empty-state.md`
- 环境：Linux 7.0.0-43-generic，NSH 0.4.0 (e626a8d)，Wayland 会话，GTK 原生测试宿主，窗口 1280×800，缩放 1，系统默认字体
- 数据：FixtureApp 协议假数据（`panelActions`：两个产物、一条例行、两个 Bot 各一条记忆）；未使用真实 sidecar
- 参照：修改前同参数原生截图
- 总结论：代码检查通过、原生显示通过；原生点击与真实 sidecar 未验证

## 复现与预期

1. 前置条件：Bot 有文件/链接产物、例行、关联文件夹与记忆。
2. 操作：打开右侧面板，分别查看三个 Tab。
3. 预期：
   - 资料库：产物卡片标题行右侧为打开文件 / 打开链接图标；“管理记忆”按钮消失，下方“小菜 记住的事”列出记忆（就地编辑），末尾一行占位输入框 + 加号图标。
   - 配置：文件夹行尾为删除图标；路径输入框与加号图标同一行，空输入时加号变淡。
   - 动态：有例行时“管理例行”为整行 ActionRow，不再是胶囊按钮。
   - 设置窗口左栏没有「记忆」。
4. 同类入口：事项详情中的产物卡片同样使用 `ArtifactCard`，一并变为图标；记忆随当前 Bot 切换。

## 代码检查

| 命令 / 工作目录 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `pnpm check`（仓库根） | 0 | 通过 | [check.log](logs/check.log) |
| `nsh test apps/desktop`（仓库根） | 0 / 68 通过 | 通过（首轮 67/68：新用例切换 Bot 后未切回资料库 Tab，修正用例后通过） | [headless.log](logs/headless.log) |
| `nsh test --target linux --filter 'bot info'`（apps/desktop） | 0 / 3 通过 | 通过 | [native.log](logs/native.log) |

unknown class 检查：headless 日志无匹配。

## 原生截图与实际对比

| 检查项与位置 | 修改前 | 本次原生图片 | 实际查看结果 | 结论 |
| --- | --- | --- | --- | --- |
| 资料库产物操作 | [01-before-library](screenshots/01-before-library.png) | [02-after-library](screenshots/02-after-library.png) | 卡片下方的“打开文件/打开链接”胶囊消失，文件、外链图标在卡片右侧与标题同区；卡片高度变小 | 通过 |
| 资料库记忆 | 同上（只有“管理记忆”按钮） | 同上 | “小菜 记住的事”下显示“用中文回复”；另一个 Bot 的记忆不出现；占位输入框与加号同行、空时加号变淡 | 通过 |
| 配置文件夹 | [01-before-configuration](screenshots/01-before-configuration.png) | [02-after-configuration](screenshots/02-after-configuration.png) | “移除”变为行尾垃圾桶图标；输入框与加号同行，原独立“关联文件夹”按钮消失；中文无裁切 | 通过 |
| 动态例行管理 | [01-before-activity](screenshots/01-before-activity.png) | [02-after-activity](screenshots/02-after-activity.png) | “管理例行”胶囊改为整行 ActionRow（时钟 + 文字 + 箭头），宽度与例行卡片一致 | 通过 |

是否实际打开原图：是（裁切右侧面板查看）。截图尺寸/环境一致：是，均为 1280×800 同一宿主。
实际入口点击、输入、保存：headless 覆盖记忆编辑/添加/Bot 隔离、文件夹添加/移除、例行管理入口；原生点击未验证（ERR-006，Tab 用 Fixture 参数切换）。
Fixture 覆盖范围：仅显示与 headless 命令；真实业务未覆盖。

## 真实业务与产物

| 操作/输入 | 预期 | 实际结果 | 后端证据 | 结论 |
| --- | --- | --- | --- | --- |
| 真实 sidecar 下添加/编辑记忆 | `memory.upsert` 持久化 | 未执行 | — | 未验证 |

协议未变（仍为 `memory.upsert`），只改了界面入口。

## 失败、未验证项与复验

- 原生点击图标、悬停提示、手形指针未验证；复验：`./start.sh` 打开右侧面板，悬停并点击各图标。
- 真实 sidecar 记忆读写未验证。
- 记忆没有删除入口：协议没有 `memory.delete`，本次不新增。

## 最终结论

代码检查：通过。原生显示：通过。实际交互：headless 通过，原生点击未验证。真实业务：未验证。

对话中展示的最终结果图片：`screenshots/02-after-library.png`、`02-after-configuration.png`、`02-after-activity.png`。
