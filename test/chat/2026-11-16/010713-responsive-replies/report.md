# 回复宽度随窗口伸缩验证记录

- 时间与时区：2026-11-16 01:07–01:11，America/Los_Angeles（UTC-08:00）
- 验证人：Codex
- 目标/触发条件：窗口放大时长回复变宽，缩小时重新换行；短回复保持紧凑，用户消息靠右，回复按钮有占位
- 代码：Git e3324505148f078e06725ca8b29470865efc6eb1；相关界面文件原为未跟踪文件，本轮修改 ChatPane.tsx、MessageBubble.tsx，新增 MessageWidthFixture.tsx 和 tests/message-width.test.tsx；同步 design/layout.md、error/nsh-ui.md、ERROR.md。本仓库另有大量既存改动与并发开发，未清理、提交或还原
- 环境：Linux 7.0.0-43-generic，NSH 0.4.0 (e626a8d)，默认 Wayland/GTK，原生测试注入输入；窗口 1280×800、1600×800、900×800，图片像素与窗口点数一致（1×）；默认 Noto Sans
- 数据：FixtureApp 协议测试数据与 MessageWidthFixture，无真实 sidecar、模型、用户数据库或私人会话
- 参照：用户截图、同一测试内容修改前原生截图；遵循 VERIFY.md 与 ERR-001
- 总结论：本次回复宽度回归与原生布局通过；全量 headless 有一个选择卡片测试失败，不能写全量通过；用户现有业务窗口是否热重载未验证

## 复现与预期

1. 旧版消息列 max-width 660px，气泡 max-width 440px，扩大窗口后长文仍窄
2. MessageWidthFixture 在 660 → 1100 的视口变化中，旧代码气泡自然高度始终为 146，回归断言失败，见 [复现日志](logs/reproduce.log)
3. 新版消息列填充聊天区域；Bot 行最大宽度为消息列 85%，气泡使用行内剩余空间，短文按内容收缩
4. 自动断言：放大后高度降低，缩小到 360 后高度增加，再回到 660 后高度恢复
5. 真实 AppShell 协议 fixture 检查长 Markdown、短回复、用户消息；900px 窗口同时展开右侧面板，检查正文和回复图标无横向溢出

## 代码检查

| 命令 / 仓库根目录 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| pnpm check | 0 | 类型与 Rust 检查通过 | [check](logs/check.log) |
| nsh test apps/desktop --filter 'long reply wrapping'，修改前 | 1 / 0通过1失败 | 成功复现固定上限问题 | [reproduce](logs/reproduce.log) |
| 同上，修改后 | 0 / 1通过 | 修复回归通过 | [regression](logs/regression.log) |
| nsh test apps/desktop | 1 / 59通过1失败，共60项 | 全量未通过；失败为 choosing an option answers once and marks the chosen row，选择答复后 option 节点计数期望0，实际1；本轮未修改该组件或测试 | [headless](logs/headless.log) |
| nsh test apps/desktop/tests/message-width.test.tsx --target linux | 0 / 3通过 | 本轮全部原生专题通过 | [native-focused](logs/native-focused.log) |
| git diff --check | 0 | 通过 | 当前工作区检查 |

unknown class 检查：本轮所有日志无匹配。

## 原生截图与实际对比

| 检查项与位置 | 参照/修改前图片 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 宽窗口长回复 | [1600修改前](screenshots/before-1600.png) | [1600修改后](screenshots/after-1600.png) | 旧气泡只有440px宽；新气泡充分使用聊天区域，换行显著减少；短回复仍紧凑，用户消息靠右 | 通过 |
| 常规窗口 | [1280修改前](screenshots/before-1280.png) | [1280修改后](screenshots/after-1280.png) | 长回复扩宽，粗体、行内代码和链接显示正常 | 通过 |
| 窄窗口 | [900修改前](screenshots/before-900.png) | [900修改后](screenshots/after-900.png) | 长文重新换行，无横向溢出，短回复仍贴合内容 | 通过 |
| 窄窗口且右侧面板打开 | 既有布局约束；修改前自动点击失败，未取得同状态原图 | [900面板打开](screenshots/after-panel.png) | 中央压缩后正文继续换行，回复图标位于气泡右侧且未被挤出；右面板、输入条可见 | 通过（Fixture 布局） |

是否实际打开原图：是，已用图片工具查看修改前1600和修改后1600/1280/900及面板打开原图。
窗口尺寸按文件名对应；相同消息内容、默认字体与缩放。长文高度变化会使自动跟随底部的滚动位置改变，未把像素差当业务证据。
本轮最终在对话中展示 screenshots/after-1600.png（宽窗口最终原生画面）。

## 真实业务与产物

本次仅改布局，未改模型、消息协议、持久化或 sidecar。真实模型调用不适用；以上是实际 GTK 原生窗口中的隔离 Fixture，不代表真实模型或真实聊天业务端到端通过。

## 失败、未验证项与复验

- 初轮 native-before 中点击 Bot 胶囊未触发面板；保留 [日志](logs/native-before.log)，后用预先打开面板的 Fixture 验证布局，没有冒充真实入口点击通过
- 首轮 native-after 使用宽泛 reply 过滤器，多运行了两个已有交互测试，分别因悬停图标与切换 Bot 未响应失败，见 [日志](logs/native-after.log)。随后精确运行本轮测试文件3项全通过，没有覆盖此前失败记录。既有原生输入边界见 ERR-006
- 全量 headless 选择卡片节点计数失败留给对应功能处理；本轮未修改选择卡片代码和测试
- 用户当前正在使用的真实窗口是否加载本轮更改未验证；可在该窗口放大/缩小并展开侧栏复验，必要时重开应用。未终止用户已有窗口或服务
- 动画、输入、保存与持久化：本次未改，不作专项验收

## 最终结论

本次代码检查通过，回复宽度专题 headless 与原生3项通过，实际原生截图比较通过。全量59/60，存在上述选择卡片失败；原生自动点击限制仍保留，不能宣称项目整体通过。
