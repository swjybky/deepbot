# 资料库分组顺序验证

- 2026-11-17 22:54–22:58 PST（UTC−08:00），Codex
- 在右侧 Bot 面板选择「资料库」后，「记住的事」应位于「保存的资料」上方。记忆列表和添加入口随分组移动。
- Git HEAD 为 `e3324505148f078e06725ca8b29470865efc6eb1`。共享工作区已有未提交变更。本次修改涉及 `BotInfoPanel.tsx` 的分组顺序、`shell.test.tsx` 的顺序断言和分组设计文档。见 [修改前指纹](logs/before.sha256) 和 [修改后指纹](logs/after.sha256)。
- Ubuntu 26.04.1、Linux 7.0.0-43-generic、NSH 0.4.0（e626a8d）、默认 GTK Wayland、1280 × 800、1×、Noto Sans CJK SC。
- 前后使用同一个隔离协议 Fixture，带「用中文回复」记忆、一个测试文件和一个测试链接。资料预览使用仓库内样本。

## 复现与预期

打开右栏「资料库」，先看到「小菜 记住的事」及添加框，接着看到「小菜 保存的资料」及资料行。修改前的专题用例在分组顺序断言失败，调整后完整通过。记忆的查看、编辑、新增、切换 Bot 与删除由同一用例覆盖。

## 代码检查与原生测试

| 命令或用例 | 结果 | 日志 |
| --- | --- | --- |
| `pnpm check` | 退出 0 | [类型与 Rust](logs/check.log) |
| `nsh test apps/desktop/tests/shell.test.tsx --filter 'memories live under the library tab'` | 修改前按预期在顺序断言失败，修改后 1/1 | [修改前](logs/order-before.log)、[修改后](logs/order-after.log) |
| `nsh test apps/desktop` | 首轮 80/81，最终退出 0，80/80 | [首轮](logs/headless.log)、[最终](logs/headless-final.log) |
| `nsh test apps/desktop/tests/panel-actions.test.tsx --target linux --filter 'bot info library tab renders its actions natively'` | 修改前后各 1/1 | [原生修改前](logs/native-before.log)、[原生修改后](logs/native-after.log) |
| `nsh test apps/desktop/tests/library-preview.test.tsx --target linux` | Wayland 文件、图片和链接通过，缺失文件点击两次未触发。隔离 X11 专项 1/1 | [Wayland](logs/native-preview.log)、[Wayland 复测](logs/native-missing-retry.log)、[X11](logs/native-missing-x11.log) |
| `nsh test apps/desktop/tests/shell.test.tsx --target linux --filter 'memories live under the library tab'` | Wayland 首次点击未触发，隔离 X11 1/1 | [Wayland](logs/native-memory.log)、[X11](logs/native-memory-x11.log) |

最终日志无 `unknown class`。首轮全量测试发现共享工作区中临时存在的生产配置验收用例，该用例在 headless 中等待真实 Agent 超时。临时文件退出测试目录后重新完整运行。

## 原生截图与对比

| 检查项 | 修改前 | 修改后 | 实际结果 |
| --- | --- | --- | --- |
| 两分组的顺序 | [原图](screenshots/01-before.png) | [原图](screenshots/02-after.png) | 「记住的事」从下方移到标签页下第一个位置。「保存的资料」跟在记忆添加框后 |
| 对齐、间距及文字 | [原图](screenshots/01-before.png) | [右栏](screenshots/02-after-panel.png) | 上方标题沿用首组间距，两个分组之间有正常间隔。条目与输入框的边线可见，未发现遮挡或截断 |

已打开前后原图和右栏裁图。窗口、面板宽度、缩放和滚动位置一致。对话中展示 [修改后右栏](screenshots/02-after-panel.png)，内容裁自最终原图。

## 验证范围

在隔离 Fixture 中验收原生显示和列表操作。分组截图使用默认 Wayland。补充交互测试使用 Xephyr 内的 X11，真实指针留在测试窗口外，进程级设置不修改系统后端。Wayland 合成点击未触发的情况与这两个用例此前的表现一致。见 [原生点击记录](../../../../error/linux-native-input.md)。

现有开发服务已经提供新版 bundle，用户当前窗口仍与该服务连接，尚未直接操作该窗口中的资料。见 [开发服务记录](logs/dev-bundle.log)。
