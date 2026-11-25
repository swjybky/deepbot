# 红色停止方块与最终图片展示验证记录

- 时间与时区：2026-11-13 01:00–01:02，America/Los_Angeles（PST）
- 验证人：Codex
- 目标/触发条件：停止按钮中心方块改为红色实心，外圈保持原样；将验证后必须在对话直接展示最终结果图片的规则写入验证规范和报告模板
- 代码：Git e3324505148f078e06725ca8b29470865efc6eb1；存在其它未提交工作，[状态](logs/worktree-after.log)、[本次文件哈希](logs/source.sha256)
- 环境：Ubuntu 26.04.1 LTS，NSH 0.4.0 (e626a8d)，Wayland，默认 GDK 后端，1280×800 原生窗口，文字缩放 1.0，项目字体 Noto Sans CJK SC
- 数据：FixtureApp 的 longCards 隔离数据，无真实私人会话或模型调用
- 参照：用户要求停止图标中心方块为红色，并在对话展示最终结果图片
- 总结论：颜色、原生交互与类型检查通过；全量界面测试 51/54，另外三项现有测试失败，详见下文

## 复现与预期

1. 修改前停止按钮中心是黑色线框、内部白色，修改后仅中心方块使用 feedback-error 红色实心填充
2. 继续使用返回右侧的停止按钮；卡片展开/收起、停止后隐藏图标、顶部关闭保持现有行为
3. VERIFY.md 和报告模板明确要求验证后直接在对话展示本轮最终原生图片，不能只给文件路径或报告链接

## 代码检查

工作目录均为仓库根目录。

| 命令 | 退出码/用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `pnpm check` | 0 | Agent 与桌面类型/Rust 检查通过 | [检查](logs/check.log) |
| `nsh test apps/desktop` | 1 / 51通过、3失败 | 本次受影响的全部事项卡片与操作用例通过；全量未通过 | [全量](logs/headless.log) |
| 原生 `nsh test apps/desktop --target linux --filter 'long cards expand'` | 0 / 1 | 原生卡片展开/收起、停止、结束后隐藏图标通过 | [原生](logs/native.log) |
| 截图像素核对 | 中心 RGB=(180,35,24) | 与 feedback-error 的 #B42318 一致 | [像素记录](logs/stop-color.json) |

无 unknown class，git diff --check 通过。原生测试使用 [临时鼠标会话脚本](native-pointer.py) 移开真实鼠标，测试后恢复位置并停止会话；未修改系统设置。

## 原生截图与实际对比

以下三张原图均已实际打开查看，相同窗口、Fixture 数据与视口。

| 检查项 | 修改前 | 最终原生图片 | 实际观察 | 结论 |
| --- | --- | --- | --- | --- |
| 停止按钮中心 | [修改前](screenshots/01-before.png) | [进行中](screenshots/02-final-running.png) | 中心由黑色线框变为红色实心方块，圆形外圈、位置、返回和关闭均保持原样 | 通过 |
| 已结束状态 | 进行中有停止图标 | [已结束](screenshots/03-final-ended.png) | 状态已取消，停止图标移除；返回与顶部关闭仍在 | 通过 |

![进行中最终结果](screenshots/02-final-running.png)
![已结束最终结果](screenshots/03-final-ended.png)

## 真实业务与产物

本次仅调整停止图标绘制与验证文档，无后端行为变更；原生行为使用隔离协议 Fixture 验证，不代表真实执行者停止验收。

## 失败、未验证项与复验

全量中三项失败位于当前工作区已有的其它调整：事项测试仍期待旧执行者文案 Self，而现界面为 Bot 自己；两个配置测试的 text:/tmp/... 选择器被当成正则并报非法标志。失败日志保留，没有扩展修改这些无关调用和断言。颜色及本次受影响事项流程均通过，不能将全量结果写成全部通过。

## 最终结论

类型检查、原生红色停止方块与停止交互通过；全量界面测试 51/54，三项其它断言/路径选择器错误保留。验证规范、报告模板和停止图标设计规则已同步。

对话展示的最终结果图片：screenshots/02-final-running.png（进行中红色停止方块）、screenshots/03-final-ended.png（结束后隐藏停止入口）；展示容器 [final-results.html](final-results.html) 只引用本轮实际原生截图，未绘制替代界面。通过 html_preview 检查后使用 html_render 直接显示在对话中。
