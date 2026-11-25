# 拖动背景仅显示在目标位置

- 时间与时区：2026-11-16 23:23–23:39，America/Los_Angeles（PST）
- 验证人：Codex
- 目标：普通/置顶 Bot 开始拖动后，源条目无选中或悬浮底色；源分组与侧栏底色一致，只有有效跨组目标高亮；松开恢复选中背景，区外不改状态
- 代码：e3324505148f078e06725ca8b29470865efc6eb1，仓库有大量原有未提交和未跟踪工作；本次修改 Sidebar.tsx、sidebar-drag.test.tsx、design/components/list.md、error/nsh-ui.md、ERROR.md 及本报告/索引；未暂存或提交
- 环境：Linux 7.0.0-43-generic，NSH 0.4.0 (e626a8d)，Wayland 会话；默认 Linux 原生专题与 GDK_BACKEND=x11 录屏分开运行；1280×800 内容视口，录屏含 12px 外框；默认缩放、Noto Sans CJK SC
- 数据：FixtureApp 隔离协议快照与内存命令回显；未访问用户私有数据、模型或真实 sidecar
- 参照：用户要求拖动源背景消失，只显示目标拖动背景
- 总结论：代码、原生显示与 Fixture 双向交互通过；用户已有窗口加载状态及真实数据重启持久化未验证

## 复现与预期

1. 选中小菜，从置顶拖到普通列表，再拖回置顶。
2. 修改前：源条目仍留半透明选中块；拖动时置顶分组存在额外背景。
3. 修改后：只去掉源条目的背景样式，不改变当前会话/选中状态；只有当前有效跨组目标显示背景。
4. 其它边界：同组不显示目标背景，拖到侧栏外不改变分组；空置顶仍临时展开接收空间，取消后收起；减少动态效果仍支持拖动。

## 代码检查

| 命令（仓库根目录） | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| pnpm check | 0 | 通过 | [check](logs/check.log) |
| nsh test apps/desktop | 0 / 75 项 | 全量通过，含新增选中源区外拖动回归 | [headless](logs/headless.log) |
| nsh test apps/desktop --target linux --filter 'sidebar drags bots between' | 0 / 1 项 | 默认 Linux 双向拖动通过 | [native-default](logs/native-default.log) |
| pointer_capture.py（运行 capture.py final-verified）（GDK_BACKEND=x11） | 0 / 1 项 | 从真实行触发双向原生拖动、录屏 | [capture](logs/capture-final-verified.log) |
| python3 verify_pixels.py before / after（本目录） | 1 / 0 | 修改前失败，修改后通过 | [before](logs/pixels-before.log)、[after](logs/pixels-after.log) |
| git diff --check | 0 | 通过 | 无输出 |

unknown class 检查：所有本轮日志无匹配。capture.py 将归档的 capture.test.tsx 临时复制到 NSH 应用测试目录，运行后清理；常规全量用例不包含该录屏辅助用例。

## 原生截图与实际对比

已实际打开原图、修改前后连续帧及反向拖动密集帧。录屏使用 FFmpeg 的 window_id 仅捕获本次原生测试窗口；下列图片均为本轮最终代码的原生录屏帧。前后视口、数据和字号相同，指针/动画时间存在差异，不将整图差异当作业务断言。

| 检查项 | 修改前/参照 | 本次实际结果 | 结论 |
| --- | --- | --- | --- |
| 置顶源的选中背景 | [before-target](screenshots/before-target.png) 源处仍有淡灰块 | [after-target](screenshots/after-target.png) 源处与侧栏底色一致，普通列表目标高亮 | 通过 |
| 普通源拖回置顶 | [初始](screenshots/after-ready.png) 选中置顶背景可见 | [反向目标](screenshots/after-pin-target.png) 普通源无背景，置顶接收区高亮 | 通过 |
| 连续过程、松开恢复 | [修改前录屏](screenshots/before.mp4) | [最终双向录屏](screenshots/final-verified.mp4)、[连续帧](screenshots/reverse-contact.png)；松开后选中背景恢复 | 通过 |
| 字体/布局 | 相同 Fixture 和视口 | 名称、头像和行间距未变，只有源背景和接收区高亮变化 | 本次视口通过；窄栏长名称未额外验证 |

像素回归取源卡片空白处与同一帧侧栏空白处的 5×5 区域中位数比较，另断言目标更深；修改前分别为 241/243，修改后均为 243。视频有编码量化，容差为 1；不把该断言推广到其它主题或平台。

最初尝试系统坐标注入未成功触发拖动，相关探测图已清理；正式证据由 NSH 原生 app.drag 输入与窗口录屏取得。首次反向录屏位移未命中置顶，后续改成命中目标的位移，并加 waitFor 分组断言；最终证据使用 final-verified.mp4。

## 真实业务与产物

Fixture 从实际 Bot 行触发原生手势，通过 bot.upsert 回显检查双向分组；新增 headless 用例覆盖置顶/普通两种选中源拖到区外，确认当前聊天保持、预览移除和分组不变。本次不改后端保存机制。真实用户数据保存、重启读回和已有窗口热更新未验证；本轮未启动真实模型，不涉及对话生成验收。

## 复测失败与处理

- 最后增加“同组不高亮”的条件后，默认原生与 X11 复测曾在拖动小菜后无法等到普通列表回显；X11 失败日志见 [原生失败记录](logs/native-final-failed.log)，默认原生失败输出已在本次工具运行中记录；最终默认原生结果另见检查表。当时仅移开真实鼠标仍失败，因此不能将原因直接归为鼠标冲突。
- 最终让拖动期间的置顶容器显式使用与侧栏相同的 bg-sidebar，而非移除背景绘制；视觉上无高亮，命中有效跨组目标时才切换 accent。调整后 X11 双向原生拖动及录屏通过。透明父容器是否改变原生输入命中仍待定位，单次对照不视为底层根因已确认。
- 最终原生录屏由 pointer_capture.py 临时移开真实鼠标后运行，两次分组都加 waitFor 断言；结束恢复指针并关闭会话。无须改变系统后端配置或产品用户数据。

## 最终结论

类型/Rust、全量 75 项 headless、默认 Linux 原生双向拖动、X11 双向原生过程显示与像素回归通过。真实用户窗口是否加载本轮变化未确认；需要在该窗口拖动复核，旧窗口未更新时重新启动加载。

对话展示最终图片：screenshots/after-target.png（置顶拖到普通列表，源无背景、目标高亮）。关联问题 ERR-001；设计规则已同步。
