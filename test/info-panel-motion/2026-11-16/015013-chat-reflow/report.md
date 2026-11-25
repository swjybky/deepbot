# 面板开关与聊天重排验证记录

- 时间与时区：2026-11-16 01:50–02:01，America/Los_Angeles（UTC-08:00）
- 验证人：Codex
- 目标/触发条件：点击顶部 Bot 胶囊展开或关闭右侧面板，避免长对话纵向扫动、关闭后跳回较早消息
- 代码：Git e3324505148f078e06725ca8b29470865efc6eb1；既有大量未提交/未跟踪工作保留。本轮修改 ResizableColumns.tsx、ChatPane.tsx、state/ui.ts、FixtureApp.tsx，新增 panel-chat-motion.test.tsx 与 panel-capture.test.tsx，同步 design/layout.md、ERROR.md、error/nsh-ui.md 与 test/README.md。[源码哈希](artifacts/source.sha256)
- 环境：Linux 7.0.0-43-generic，NSH 0.4.0 (e626a8d)，GNOME 系统动画当前为 true（仅查询，未修改）；默认 Wayland 原生专题，以及进程级 GDK_BACKEND=x11 的独立原生录屏。窗口1280×800，1×，默认 Noto Sans；X11捕获包含阴影为1304×824，展示PNG裁去12px阴影
- 数据：FixtureApp 的14条公开长对话，无真实模型、sidecar 或私人会话；NSH 测试运行器使用隔离 /tmp/nsh-test-* 数据目录
- 参照：当前修改前原生截图，用户报告，ERR-001，design/layout.md 和 VERIFY.md
- 总结论：见最终结论；原生布局与动画取证通过，用户现有真实业务窗口的图标点击未单独验收

## 复现与预期

1. 固定同一组14条长消息，先滚到最后一条，再展开/关闭面板。
2. 修改前，setInfoPanel 对整个提交配置 LayoutAnimation，正文因变窄重新换行，所有后代高度和上下位置一起参与插值。onScroll 又把内容尺寸变化当作用户上翻，丢失底部跟随。
3. 修改前原生 closing-1 画面已跳回第6–11条附近，最后第14条离开视口；修改后 closing-1 与最终关闭画面均保留最后第14条在输入框上方。
4. 新实现只对右侧面板做280ms原生translateX；聊天按最终宽度一次重排。面板持续完整宽度，关闭完成后隐藏、立即禁用交互；支持连续反转和减少动态效果。
5. 布局事件与同尺寸滚动分开处理，重排保留此前followBottom状态；用户主动滚动仍可离开底部。

## 代码检查

| 命令（仓库根目录） | 结果 | 日志 |
| --- | --- | --- |
| pnpm check | 退出0，类型与Rust检查通过 | [check](logs/check.log) |
| nsh test apps/desktop，最终版 | 退出0，63/63通过 | [headless-final](logs/headless-final.log) |
| nsh test apps/desktop --target linux --filter 'panel motion keeps long chat' | 默认Wayland，1/1通过；展开、关闭、连续反转 | [native-final](logs/native-final.log) |
| GDK_BACKEND=x11 nsh test apps/desktop --target linux --filter 'capture panel animation without' | 1/1通过；定时开关，驱动等待13秒，不在开关之间执行快进步骤 | [native-capture-final](logs/native-capture-final.log) |
| git diff --check | 通过 | 本轮工作区检查 |

最终check/headless-final/native-final/native-capture-final日志均检查unknown class与unsupported警告；未发现匹配。中间失败日志单独保留，不作为通过证据。

## 原生截图与实际对比

| 检查项与位置 | 修改前 | 修改后原生图片 | 实际查看结果 | 结论 |
| --- | --- | --- | --- | --- |
| 长对话关闭面板 | [关闭中](screenshots/before-closing-1.png) | [关闭中](screenshots/after-closing-1.png) | 旧画面跳回较早消息；新画面最后第14条仍在输入框上方 | 通过 |
| 面板展开中间帧 | 旧测试驱动会把有限动画快进，静态图不足以验收过程 | [真实中间帧](screenshots/native-opening-middle.png) | 面板从右侧水平滑入，正文按最终宽度显示，无逐条纵向插值 | 通过，X11 |
| 面板关闭中间帧 | 同上 | [真实中间帧](screenshots/native-closing-middle.png) | 面板水平向右滑出，聊天底部保持最后消息；面板在滑出过程中可短暂覆盖已扩宽的聊天区域 | 通过，X11 |
| 最终展开状态 | [展开后](screenshots/before-open.png) | [最终展开](screenshots/native-final-open.png) | 面板内容完整、最新消息可见，输入条和顶部胶囊位置正常 | 通过 |
| 连续反转 | 原生既有布局验收 | [反转后展开](screenshots/after-reversed-open.png) | 未丢失消息和面板，专题通过 | 通过 |

是否实际打开原图：是，查看修改前closed/opening-1/closing-1，修改后opening-1/opening-2/closing-1/closed-again，以及录屏提取的展开中、关闭中、最终展开三张原图。
动画：[实际原生录屏](artifacts/native-motion.mp4)，[展开与关闭GIF](screenshots/native-motion.gif)。录屏只捕获隔离测试窗口，无桌面其它应用。
取证：60fps，窗口底色行检测确认面板左边界在展开过程中有多帧不同位置，再反向滑出。不是仅比较终态；原视频保留。[像素回归](artifacts/check-bottom.py)对比旧关闭帧的裁切与新关闭帧的底部留白，见[日志](logs/bottom-regression.log)。两种后端分别记录，不将X11连续动画验收推广成Wayland同样已录屏。
对话直接展示 screenshots/native-final-open.png，并链接screenshots/native-motion.gif。

## 真实业务与产物

本次只改界面动画和滚动处理，不涉及模型、后台派活或持久化。Fixture 验证实际 AppShell 原生渲染；不代表真实模型对话或用户现有业务窗口已验收。用户窗口/服务未被关闭。

## 失败、未验证项与复验

- 早期实现出现unsupported prop pointerEvents；类型检查发现后改入style。面板移到屏外后，测试仍能找到内容，已增加关闭完成后的visibility隐藏，相关原有测试现已通过。保留 [首次headless](logs/headless-attempt.log) 与 [早期native](logs/native-after.log)
- 直接用一个新入口import已mount的FixtureApp取证时产生unknown class，按失败处理；同类临时预览也未消除问题，不采信其画面。相关日志standalone.log、standalone-final.log、capture.log与native-capture.log仅保存失败过程；临时入口已删除。最终改为直接打开现有FixtureApp，通过host.params启用定时开关，最终日志无该警告
- 默认NSH测试步骤会完成有限动画，故最终连续动画单独使用X11原生窗口+ffmpeg x11grab，仅捕获指定window_id。运行时使用进程级GDK_BACKEND，没有修改用户全局图形设置
- 当前真实业务窗口图标的鼠标点击和用户手感仍待用户实际操作核对；既有自动点击边界见ERR-006。headless的真实图标入口与关闭入口已包含在全量测试
- 从测试目录运行同名capture用例时会等待13秒，以允许外部录屏。连续动画复验方法：以X11运行该用例，在其窗口出现后用ffmpeg -f x11grab -framerate 60 -window_id <隔离测试窗口ID> -i :0 -t 11录屏

## 最终结论

代码检查通过；默认Wayland原生专题通过；X11连续横向动画与底部跟随已实际查看关键帧并保留录屏。全量最终63/63通过，日志无unknown class或unsupported警告。原生真实业务窗口的鼠标点击仍未单独验收。
