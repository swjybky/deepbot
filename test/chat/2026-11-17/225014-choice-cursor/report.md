# 提问卡片的手形光标验证

2026-11-17 22:50–22:54 PST，Codex 执行。Git HEAD 为 `e332450`，工作树已有未提交改动。本次功能修改在 `apps/desktop/ui/components/Pressable.tsx`，前后源码校验值分别见 [修改前](logs/before.sha256) 和 [修改后](logs/after.sha256)。

原生窗口使用 Ubuntu 26.04.1、Linux 7.0.0-43、NSH 0.4.0（e626a8d）、GTK X11 与独立 Xephyr 显示。窗口 1280 × 800，缩放 1，Noto Sans CJK SC。采用 `FixtureApp.tsx` 中的批准提问及模拟协议，验证过程使用隔离窗口和数据。

## 复现与预期

在「批准发送这份结果」卡片上，依次把指针移到可展开的题干、摘要、「批准」选项及其徽标。在「其他」输入文字后悬停「答复」按钮。所有可点击文字和其按钮区域应显示手形，输入框和可选正文应显示 I 形，禁用的发送按钮应显示箭头。可展开题干应能点击展开、收起，答复应出现于已答卡片。

同一 `ChoiceCard` 入口覆盖决定、批准、外部确认和规矩确认。`Pressable` 加 `select-none` 使按钮文字退出聊天区的跨气泡选择，从而使用按钮的指针样式。

## 代码检查

| 命令或用例 | 退出码与结果 | 日志 |
| --- | --- | --- |
| `pnpm check` | 0，通过 | [最终检查](logs/check-final.log) |
| `nsh test apps/desktop/tests/choice-card.test.tsx --filter 'choice cards list'` | 0，1/1 | [选择卡片专题](logs/choice-final.log) |
| `nsh test apps/desktop` | 0，80/80 | [全量 headless](logs/headless-final.log) |
| [原生光标回归脚本](verify-cursor.sh) | 0，10 个位置的指针名均符合预期 | [最终回归](logs/native-regression-final.log) |

最终运行未发现 `unknown class` 或 `unsupported prop`。最初尝试的 `Text selectable` 属性被 NSH 0.4.0 拒绝，已移除并从最终源码重新验证。见[首次类型检查](logs/check.log)。

## 原生截图与实际对比

用 XFixes 读取窗口实际显示的光标名，并用 ffmpeg 截取包含实际光标的 PNG。已打开原图对比。参照和最终截图的窗口尺寸、卡片内容与缩放一致。滚动位置、标题、选项、输入框的布局未见变化。

| 检查项 | 修改前 | 修改后 | 实际结果 |
| --- | --- | --- | --- |
| 可展开题干和摘要 | [题干](screenshots/01-before.png) | [题干](screenshots/02-after.png)、[摘要](screenshots/02-after-detail.png) | 题干从 I 形变为手形，摘要显示手形。灰底悬浮反馈保留 |
| 选项文字和字母徽标 | [文字](screenshots/01-before-option.png)、[徽标](screenshots/01-before-badge.png) | [文字](screenshots/02-after-option.png)、[徽标](screenshots/02-after-badge.png) | 从 I 形变为手形，整行在悬浮时高亮 |
| 「答复」按钮 | [I 形](screenshots/01-before-submit.png) | [手形](screenshots/02-after-submit.png) | 同一位置切换为手形 |
| 输入、正文及禁用按钮 | [输入](screenshots/01-before-input.png)、[正文](screenshots/01-before-message.png) | [输入](screenshots/02-after-input.png)、[正文](screenshots/02-after-message.png)、[禁用发送](screenshots/02-after-disabled-button.png) | 输入与正文显示 I 形，禁用按钮显示箭头 |
| 展开、收起和提交 | — | [展开](screenshots/03-expanded.png)、[已答复](screenshots/04-answered.png) | 点击题干展开完整摘要，再点击收起。输入 `follow` 并点击「答复」，卡片仅显示已答文字，该文字显示 I 形 |

修改前的 [XFixes 记录](logs/cursor-before.log) 将题干、选项和答复按钮都识别为 `text`，对照的加号按钮为 `pointer`。原生回归前两次遇到 Xephyr 的无名 X 光标，复核时仅对无名结果额外移动一次，再按期望名称断言。保留[首次](logs/native-regression.log)和[第二次](logs/native-regression-retry.log)记录。

## 复验与范围

在新的隔离 X11 显示用 `GDK_BACKEND=x11 GDK_SCALE=1 GSK_RENDERER=cairo GTK_IM_MODULE=simple nsh run apps/desktop/FixtureApp.tsx --port 8794 --window-size 1280x800` 启动。运行 `bash verify-cursor.sh <隔离显示号> <本轮截图目录>`。脚本需要 xdotool、ffmpeg、C 编译器和 XFixes 开发库。使用进程级环境变量。测试窗口由独立端口和进程提供，不接真实 sidecar。

原生手形、禁用和文本光标通过，Fixture 的展开、收起、输入和提交通过。现有开发服务的 bundle 已含修复，现有窗口仍连着该服务。默认 Wayland 和用户当前窗口上的实际悬停尚未验证。真实模型提问和后端持久化未运行，本轮改动针对按钮光标。见 [开发服务记录](logs/running-dev-bundle.log)。

对话中展示 [题干的最终原生截图](screenshots/02-after.png)。
