# 用户消息和 Bot 回复的气泡宽度上限

- 时间与时区：2026-11-18，America/Los_Angeles（PST，UTC−08:00）
- 验证人：Codex
- 目标：拉宽窗口或改变分栏时，两种消息在可用空间内伸缩，气泡达到 640px 后停止变宽
- 代码：Git e3324505148f078e06725ca8b29470865efc6eb1，含本轮未提交的 MessageBubble.tsx、message-width.test.tsx、MessageWidthFixture.tsx。[被测文件哈希](logs/tested-files.sha256)
- 环境：Ubuntu 26.04.1 LTS，Linux 7.0.0-43-generic，NSH 0.4.0 (e626a8d)，默认 GTK Wayland，原生测试注入输入。截图尺寸为 1280×800、1600×800、900×800，缩放 1×，应用主题字体 Noto Sans CJK SC
- 数据：隔离的 FixtureApp 协议快照及增量消息，回归另用同一段测试文本渲染两个真实 MessageBubble
- 参照：用户截图和改动前用相同测试采集的原生截图
- 总结论：类型检查、消息宽度回归、原生分栏拖动和截图对比通过。全量 81 项中 80 项通过，模型列表断言 1 项失败

## 复现与预期

1. 在实际 AppShell 中渲染用户问题、带 Markdown 的 Bot 长回复和两种短消息。
2. 将窗口从 1280px 拉宽到 1600px。修改前 Bot 气泡从 769px 扩到 990px。修改后两个角色的长气泡均稳定在 640px，约每行 40 个全角字。
3. 缩至 900px，再展开右栏。两种长消息都进一步收窄、换行，并保留气泡内边距和回复按钮位置。短消息贴合内容。
4. 回归用实际气泡的自然高度检查两个角色：660px 到 1100px 时减少换行，1100px 到 1500px 时行数稳定，缩至 360px 时增加换行，回到 660px 时恢复。
5. 在原生三栏测试中分别拖动左右分隔线，检查聊天栏宽度随之变化以及面板重开后保留栏宽。

## 代码检查

| 命令（仓库根目录） | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `nsh test apps/desktop/tests/message-width.test.tsx --target linux`（修改前） | 1 / 2 通过 1 失败 | 成功复现，1100px 到 1500px 时 Bot 气泡继续减少换行 | [原生基线](logs/native-before.log) |
| `nsh test apps/desktop/tests/message-width.test.tsx --target linux`（修改后） | 0 / 3 通过 | 两种气泡宽度及窄栏回归通过 | [原生回归](logs/native-after.log) |
| `nsh test apps/desktop/tests/column-layout.test.tsx --target linux --filter 'resizes both column dividers'` | 0 / 1 通过 | 两侧分隔线拖动及重开恢复通过 | [原生拖动](logs/native-divider.log) |
| `pnpm check` | 0 | 类型与 Rust 检查通过 | [日志](logs/check.log) |
| `nsh test apps/desktop` | 1 / 80 通过 1 失败 | 消息宽度 3 项通过，模型列表 1 项失败 | [全量日志](logs/headless.log) |
| `git diff --check` | 0 | 通过 | [退出码](logs/diff-check.exit-code) |

全部验证日志中未发现 `unknown class`。

## 原生截图与实际对比

| 检查项 | 修改前 | 修改后 | 实际查看结果 | 结论 |
| --- | --- | --- | --- | --- |
| 1280×800 | [原图](screenshots/01-before-1280.png) | [原图](screenshots/02-after-1280.png) | Bot 宽度从 769px 收至 640px，用户长气泡从 440px 放宽至 640px。左边缘和右边缘分别贴齐聊天区，短气泡保持紧凑 | 通过 |
| 1600×800 | [原图](screenshots/01-before-1600.png) | [原图](screenshots/02-after-1600.png) | Bot 宽度从 990px 收至 640px，用户长气泡从 440px 放宽至 640px。继续放大后的两种长消息行宽和换行位置与 1280px 相同。粗体、行内代码和链接可见 | 通过 |
| 900×800，右栏关闭 | [原图](screenshots/01-before-900.png) | [原图](screenshots/02-after-900.png) | 长 Bot 气泡 446px，长用户气泡 532px，自动换行并保留两侧边距 | 通过 |
| 900×800，右栏展开 | [原图](screenshots/01-before-panel.png) | [原图](screenshots/02-after-panel.png) | 长 Bot 气泡 191px，长用户气泡 232px，均在中央栏内完整换行，输入条和右栏可见 | 通过 |

八张原图均已实际查看。每组截图采用相同内容、窗口尺寸、系统字体和缩放。聊天跟随底部，因此内容重排后纵向位置可变化。[气泡宽度像素测量](logs/native-widths.log)

## 真实业务与产物

本次变更是前端布局。原生窗口使用隔离协议 Fixture，未接入真实模型和用户会话。模型调用、发送持久化、应用安装不适用。

## 失败、未验证项与复验

- 模型列表用例预期 6 个提供方和 6 个模型，Fixture 按当前预设生成了 7 个（含 Magpie）。单独重跑模型 Fixture 复现同一断言失败，该 Fixture 未加载消息气泡。[重跑日志](logs/model-layout-recheck.log)
- 用户当前窗口的热重载未确认。已有窗口及服务继续运行。
- 关联 [ERR-001](../../../../error/nsh-ui.md)。

## 最终结论

本次目标在隔离 Linux GTK 原生窗口通过。两种长气泡到 640px 后维持阅读行宽，可用空间变窄时自动换行，短消息保持紧凑。

对话展示本轮截图 [1600px 宽窗口](screenshots/02-after-1600.png) 与 [900px 展开右栏](screenshots/02-after-panel.png)。
