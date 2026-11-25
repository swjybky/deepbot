# 侧栏空置顶区与拖动显示验证

- 时间与时区：2026-11-16 23:15–23:20，America/Los_Angeles（UTC-08）
- 验证人：Codex
- 目标：清空置顶后普通列表上移；拖动时自动展开置顶背景；空区重新置顶、区外松开正常
- 代码：e3324505148f078e06725ca8b29470865efc6eb1，仓库存在大量原有未提交/未跟踪工作，未覆盖、暂存或提交。本次涉及 Sidebar.tsx、sidebar-drag.test.tsx、design/components/list.md、error/nsh-ui.md、ERROR.md 和本验证记录
- 环境：Linux 7.0.0-43-generic，NSH 0.4.0 (e626a8d)，宿主 Wayland；默认 Linux 与 GDK_BACKEND=x11 分开运行；1280×800 逻辑视口、默认缩放、Noto Sans CJK SC；原生注入拖动
- 数据：FixtureApp 的隔离内存协议快照；没有操作用户数据或用户窗口
- 总结论：专题代码与原生交互/显示通过；全量 headless 74/74 通过，无 unknown class

## 复现与预期

1. 将另一个 Bot 置顶，再依次把两个置顶拖回普通列表。
2. 修改前：置顶清空后仍留有 92pt 空白；新增“置顶区不可见”断言在 headless 和 Linux 原生均失败，见 logs/repro.log、logs/native-before.log。
3. 修改后：空置顶内容卸载，普通列表顶齐创建按钮下方。再次拖动展开接收区，浅色背景可见，命中后加深；按展开后的区域保存置顶状态。
4. 专题补充：拖到侧栏外松开，不改变分组，空置顶区收起；减少动态效果仍可置顶；已有右键菜单测试覆盖取消置顶等命令。

## 代码检查

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| nsh test apps/desktop | 74/74 通过，无 unknown class | [全量](logs/headless.log) |
| pnpm check | 类型与 Rust 检查通过 | [check](logs/check.log) |
| nsh test apps/desktop --filter 'sidebar drags bots between' | 1/1 通过 | [专题](logs/sidebar.log) |
| nsh test apps/desktop --filter 'empty pinned zone' | 1/1 通过 | [空区](logs/empty.log) |
| nsh test apps/desktop --target linux --filter 'sidebar drags bots between' | 默认 Linux 1/1 通过 | [原生](logs/native-after.log) |
| 同上，GDK_BACKEND=x11 | 1/1 通过；录屏运行另一次 1/1 | [X11](logs/native-x11.log)、[录屏运行](logs/native-capture.log) |
| git diff --check | 通过 | 无输出 |

## 原生截图与实际对比

已实际打开原图和连续关键帧拼图。修改前后均为本轮默认 Linux 的 1280×800 Fixture 截图；连续录屏单独使用 X11，窗口录制含边框，不作逐像素比较。

| 检查项 | 修改前/参照 | 修改后 | 实际观察与结论 |
| --- | --- | --- | --- |
| 置顶清空 | [01-before](screenshots/01-before.png) | [02-after](screenshots/02-after.png) | 普通列表首行从 y=152 上移到 y=60，空白消失，通过 |
| 拖动自动显示背景 | 清空后无接收背景 | [04-drag](screenshots/04-drag.png) | 空置顶区展开，圆角浅色背景可见，源行变淡、头像预览跟随，通过 |
| 连续过程 | [关键帧](screenshots/contact.png) | [原生录屏](screenshots/drag.mp4) | 5.6–5.8s 取消最后一个置顶；6.0–6.6s 列表上移；6.83s 重新展开与预览，通过 |

## 真实业务与产物

原生从实际 Bot 行/头像执行双向拖动，经 Fixture 的 bot.upsert 与 snapshot 回显更新分组，当前会话保留；未启动新的真实 sidecar 或修改用户 Bot 数据。本次未改变后端置顶保存逻辑，真实用户窗口和重启持久化未验证。窄栏、多行置顶和长名称组合未额外验收。

## 最终结论

代码专题、默认 Linux/X11 双向拖拽和原生画面对比通过。区外松开及减少动态效果由 headless 覆盖。用户正在运行的窗口是否加载本次热更新未验证。

对话展示最终图片：screenshots/02-after.png（清空后列表上移）、screenshots/04-drag.png（重新拖动自动显示背景）。关联问题：ERR-001。
