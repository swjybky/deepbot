# 聊天消息列居中验证

- 时间与时区：2026-11-18，America/Los_Angeles（PST，UTC−08:00）
- 验证人：Codex
- 目标：拉宽窗口后，整列对话留在聊天区中央。窄窗和右栏展开时，仍保留两侧边距并自然换行。
- 代码：Git e3324505148f078e06725ca8b29470865efc6eb1，加上未提交的 ChatPane.tsx 消息列布局改动。[被测文件哈希](logs/tested-files.sha256)
- 环境：Ubuntu 26.04.1 LTS，Linux 7.0.0-43-generic，NSH 0.4.0 (e626a8d)，默认 GTK Wayland，原生测试注入输入。截图为 1600×800、1280×800 和 900×800，缩放 1×，主题字体 Noto Sans CJK SC。
- 数据：FixtureApp 通过测试专用协议消息渲染长短用户消息、Markdown 回复和提问卡片。
- 参照：用户参考图和相同内容的修改前原生截图。
- 总结论：类型检查、全量 81/81、原生消息宽度、消息列居中及右栏开合回归通过。

## 复现与预期

1. 在原生 AppShell 的隔离 Fixture 中打开聊天，使用前后相同的消息、窗口尺寸、字体与缩放。
2. 将窗口从 1280px 拉宽至 1600px。旧版两种气泡靠聊天区左右边缘，边距仍约 24px。修改后整列最大 960px，左右留白同步变大，消息列和输入框共用聊天区中线。
3. 将窗口缩至 900px 并展开右栏。两种气泡在各自的列边缘对齐，长文重新换行，短气泡贴合内容。
4. 使用现有右栏测试验证在长对话底部开合时，最近一条消息继续可见。

## 代码检查

| 命令（仓库根目录） | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `pnpm check` | 0 | 类型和 Rust 检查通过 | [日志](logs/check.log) |
| `nsh test apps/desktop` | 0 / 81 通过 | 全量通过 | [全量日志](logs/headless.log) |
| `nsh test apps/desktop/tests/message-width.test.tsx --target linux` | 前后均 0 / 各 3 通过 | 原生宽窄窗、气泡宽度和右栏布局 | [改前](logs/native-before.log)、[改后](logs/native-after.log) |
| `python3 artifacts/check-centering.py screenshots/01-before-*.png` 与 `python3 artifacts/check-centering.py screenshots/02-after-*.png`（报告目录） | 改前 1，改后 0 | 改前 1600px 窗口复现，改后四种布局全部符合 | [脚本](artifacts/check-centering.py)、[改前](logs/centering-before.log)、[改后](logs/centering-after.log) |
| `nsh test apps/desktop/tests/panel-chat-motion.test.tsx --target linux` | 0 / 1 通过 | 右栏开合和反转时的最新消息可见性断言通过 | [日志](logs/native-scroll.log) |
| `git diff --check` | 0 | 通过 | [退出码](logs/diff-check.exit-code) |

本轮全部验证日志未出现 `unknown class`。

## 原生截图与实际对比

| 检查项 | 修改前 | 修改后 | 实际查看结果 | 结论 |
| --- | --- | --- | --- | --- |
| 1600×800 | [原图](screenshots/01-before-1600.png) | [原图](screenshots/02-after-1600.png) | Bot 和提问卡片贴齐消息列左边，用户气泡贴齐右边，两端各内收 156px。两侧留白实测 179/180px，消息列与输入框中心重合 | 通过 |
| 1280×800 | [原图](screenshots/01-before-1280.png) | [原图](screenshots/02-after-1280.png) | 消息列随聊天区收窄，左右留白约 24px。两个角色的长气泡仍可达到 640px | 通过 |
| 900×800 | [原图](screenshots/01-before-900.png) | [原图](screenshots/02-after-900.png) | 气泡根据聊天区宽度换行，左右边缘及短消息宽度自然 | 通过 |
| 900×800，右栏展开 | [原图](screenshots/01-before-panel.png) | [原图](screenshots/02-after-panel.png) | 约 320px 的中央栏内两侧留白约 24px，长文完整换行，底部输入条居中 | 通过 |

八张原生截图均已实际查看。像素测量取气泡底色的两侧边缘，允许 1px 分隔线与像素取整误差。

## 真实业务与产物

本轮验证覆盖真实 GTK 原生渲染中的 AppShell 布局。发送消息、模型调用、会话持久化不涉及本次样式改动。

## 失败、未验证项与复验

- 用户当前窗口是否完成开发热重载未确认。
- 关联 [ERR-001](../../../../error/nsh-ui.md)。

## 最终结论

宽窗中整列消息和输入框居中。窄窗及展开右栏时消息随可用空间收窄，用户与 Bot 的气泡仍分别贴齐消息列两侧。

对话展示 [1600px 窗口的最终原生截图](screenshots/02-after-1600.png)。
