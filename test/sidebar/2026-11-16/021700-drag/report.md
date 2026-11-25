# 侧栏 Bot 跨置顶区拖动验证记录

- 时间与时区：2026-11-16 02:17–02:21，America/Los_Angeles（UTC-08:00）
- 验证人：Codex
- 目标/触发条件：普通 Bot 拖到置顶头像区后置顶；置顶 Bot 拖到普通列表后取消置顶；显示拖动浮层和缩放动效
- 代码：Git e3324505148f078e06725ca8b29470865efc6eb1；原有大量未提交与未跟踪文件保留。本轮修改 Sidebar.tsx，新增 components/DragSource.tsx、tests/sidebar-drag.test.tsx，更新 design/components/list.md、test/README.md 和本目录
- 环境：Linux，NSH 0.4.0 (e626a8d)，Wayland 会话；默认原生后端及单独 GDK_BACKEND=x11；1280×800，Noto Sans CJK SC；输入为 NSH 注入原生拖动
- 数据：隔离 FixtureApp 协议快照；backend 专题使用临时账本，无模型调用，无用户数据修改
- 参照：用户截图中的顶部磁贴/下方普通行，以及本轮原生拖动前截图
- 总结论：代码、原生双向拖动和动画画面已验证；真实用户数据的应用重启持久化未验证

## 复现与预期

1. 侧栏初始一个置顶 Bot、一个普通 Bot；拖普通行向上 110pt，松开进入置顶区
2. 拖置顶头像向下 210pt，松开进入普通区；清空置顶区后仍可重新拖入
3. 拖动中原条目变淡，浮层跟随指针并轻微放大，接收区域高亮；松开后新条目缩放到位
4. 组内与侧栏外松开不修改置顶状态；普通点击、右键、既有排序不变；减少动态效果时跳过缩放

## 代码检查

| 命令 / 工作目录（仓库根目录） | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| pnpm check | 0 | 通过 | [check](logs/check.log) |
| nsh test apps/desktop | 0 / 72 | 全量通过（含减少动态效果） | [全量 headless](logs/headless.log) |
| nsh test apps/desktop --filter 'sidebar drag' | 0 / 2 | 双向、预览、取消通过 | [专题](logs/drag-headless.log) |
| node --test --test-name-pattern='sidebar' packages/agent/tests/runtime.test.ts | 0 / 1 | 后端账本置顶、隐藏等保存通过 | [backend](logs/backend.log) |
| nsh test apps/desktop --target linux --filter 'sidebar drags bots between' | 0 / 1 | 默认后端双向、空置顶区通过 | [native](logs/native.log) |
| GDK_BACKEND=x11 nsh test apps/desktop --target linux --filter 'sidebar drags bots between' | 0 / 1 | 连续录屏，双向及空置顶区通过 | [native-capture](logs/native-capture.log) |

unknown class 检查：本目录日志无匹配；git diff --check 通过。

## 原生截图与实际对比

已使用图片工具实际打开三张完整原生 PNG 和录屏关键帧拼图。以下三个 PNG 来自本轮 X11 原生运行；此前默认后端亦通过，画面文件随后被 X11 同名输出覆盖。

| 检查项与位置 | 参照/修改前图片 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 普通转置顶 | [拖动前](screenshots/deepbot-sidebar-before.png) | [置顶后](screenshots/deepbot-sidebar-pinned.png) | 普通行变为第二个置顶头像格，名称与星标完整，当前会话仍是小菜 | 通过 |
| 置顶转普通 | [置顶后](screenshots/deepbot-sidebar-pinned.png) | [取消置顶后](screenshots/deepbot-sidebar-unpinned.png) | 小菜从顶部移至普通列表，另一个 Bot 保留置顶；当前会话不被拖动切换 | 通过 |
| 动画开始、中间、结束 | [录屏关键帧](screenshots/contact.png) | [原生连续录屏](screenshots/drag-motion.mp4) | 3.4–3.6秒浮层向上移动、源行变淡、置顶区高亮；3.7秒进入置顶；4.3–4.7秒向下移动，4.8秒进入普通列表；5.9秒空置顶区提示可见 | 通过 |
| 窄栏、多行置顶、长名称 | 当前仅默认 280pt 左栏 | — | 未覆盖 | 未验证 |

是否实际打开原图：是。截图尺寸/环境一致：本轮三张 1280×800、X11、同一 Fixture。
Fixture 覆盖真实 AppShell、侧栏拖动入口、协议命令及快照回显；不代表真实用户数据的重启验收。
动画：[裁剪为侧栏的 GIF](screenshots/drag-motion.gif)，保留完整原生录屏与关键帧原图。

## 真实业务与产物

| 操作/输入 | 预期 | 实际结果 | 后端证据/产物及校验值 | 结论 |
| --- | --- | --- | --- | --- |
| 原生拖普通 Bot 到置顶再拖回 | 调用已有 bot.upsert，快照更新后移动分组 | 两种后端均完成；普通区与置顶区为空时仍可接收 | 原生测试断言 | 通过，Fixture |
| 后端置顶保存 | 账本 pinnedAt 存在，取消置顶后移除 | 专题测试通过 | [日志](logs/backend.log) | 通过，隔离后端 |
| 运行中的开发服务 | 提供新侧栏代码 | 127.0.0.1:8790/bundle.js 含 sidebar-drag-preview 与 sidebar-pinned-zone | 本轮读取确认 | 通过，仅证明服务提供新代码 |
| 用户窗口和真实数据重启 | 重启后保留置顶状态 | 未操作用户现有 Bot 或重启用户窗口 | — | 未验证 |

## 失败、未验证项与复验

- 早期 headless 断言尝试在侧栏外寻找预览，预览受侧栏裁切，断言失败；调整为区内验证浮层、另行断言区外取消。未改变产品命中区来迎合测试
- 原生 dragAndHold 暂不受 NSH 支持，改用真实原生 drag 配合外部窗口录屏验证过程
- 真实用户窗口的热更新加载、重启持久化及窄栏/长名称组合未验证；可在用户窗口将一个普通 Bot 拖上再拖回，重启检查保留结果
- 无新通用 bug 根因；未修改 ERROR.md。设计约束明确避免全局布局动画，沿用 ERR-001

## 最终结论

代码检查、Fixture 原生双向拖动及动画画面通过；真实用户数据重启验收未执行。对话展示本轮原生侧栏 GIF，并附报告链接。
