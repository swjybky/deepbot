# 删除 Bot 拖动说明小字 验证记录

- 时间与时区：2026-11-16 23:12 起，America/Los_Angeles（UTC-08:00）
- 验证人：Codex
- 目标/触发条件：拖动 Bot 时不出现左下角操作说明；空置顶区不出现“拖到这里置顶”；双向拖动仍正常
- 代码：e3324505148f078e06725ca8b29470865efc6eb1；仓库原有大量未提交和未跟踪工作保留。本轮仅修改 Sidebar.tsx、sidebar-drag.test.tsx、DESIGN.md、design/components/{feedback,list}.md、ERROR.md、error/feedback.md、test/README.md 和本目录
- 环境：Linux，NSH 0.4.0 (e626a8d)，Wayland 会话，GDK_BACKEND 未设置，NSH 原生注入拖动，1280×800，默认缩放与 Noto Sans CJK SC
- 数据：FixtureApp 隔离协议数据；未修改用户 Bot、模型、会话或服务
- 参照：用户需求、同一轮修改前原生截图
- 总结论：原生 Fixture 双向拖动与空置顶区显示通过；代码检查结果见下表

## 复现与预期

1. 修改前先加入断言，运行 `nsh test apps/desktop --filter 'sidebar drag'`：两个用例均失败，分别看见空置顶区提示和拖动中的“松开移到普通列表”。见 [复现日志](logs/reproduce.log)
2. 修改前原生专题在清空置顶区后截图，再被新增断言阻止，符合预期：[日志](logs/native-before.log)
3. 删除两个说明节点，保留接收空间、拖动预览、目标高亮与原有置顶命令；设计规则规定容易理解的操作不加冗余说明，也不改成通知
4. 修改后双向拖动、清空置顶区、重新拖入；headless 覆盖拖动保持期间无说明、取消、区外松开和减少动态效果

## 代码检查

| 命令（仓库根目录） | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| pnpm check | 0 | 通过 | [check](logs/check.log) |
| nsh test apps/desktop | 0 / 73 | 全量通过 | [headless](logs/headless.log) |
| nsh test apps/desktop --target linux --filter 'sidebar drags bots between' | 0 / 1 | 通过 | [native](logs/native-after.log) |
| git diff --check | 0 | 通过 | 本轮执行 |

unknown class：本轮日志未发现。

## 原生截图与实际对比

已用图片查看工具打开全部三张原图，均为本轮 1280×800 原生截图。

| 检查项与位置 | 参照/修改前图片 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 空置顶接收区 | [修改前](screenshots/01-before-empty.png) | [修改后](screenshots/02-after-empty.png) | 顶部“拖到这里置顶”消失，接收空间与普通列表位置保留，账户行仍在左下角 | 通过 |
| 拖入置顶 | 同上 | [两个置顶 Bot](screenshots/03-after-pinned.png) | 两个头像、名称及星标完整，拖动后会话仍为小菜 | 通过 |
| 拖动中的左下角说明 | 修改前 headless 复现日志 | 修改后 headless 持续拖动断言 | 说明节点已删除，持续拖动期间断言无两种说明；本轮未截取原生持续拖动帧 | 代码/自动测试覆盖，原生过程截图未验证 |

本轮不修改动画；未重复录屏。实际入口为 Fixture 中真实 Sidebar，拖上、拖下、清空后再拖上均完成。Fixture 不证明真实用户数据的重启持久化。

## 真实业务与产物

原生 Fixture 从侧栏拖动入口触发 bot.upsert，协议回显后进入对应分组。无后端逻辑改动，不调用真实模型。未操作用户窗口或用户数据，真实 sidecar 重启持久化不在本次视觉删减范围。

## 失败、未验证项与复验

- 修改前测试失败是新增断言复现问题的预期结果，日志保留
- NSH 原生不支持 dragAndHold，拖动中的无小字由 headless 持续拖动断言验证，未将静态截图记为拖动过程已验收
- 用户当前业务窗口是否加载本轮代码未验证；若仍见旧提示，重新打开开发窗口，再将 Bot 向上、向下拖动确认
- 通用规则及防复发记录见 [ERR-010](../../../../error/feedback.md)

## 最终结论

类型检查、原生 Fixture 双向拖动及空置顶区截图对比通过；全量 headless 73/73 通过。原生持续拖动截图、用户当前窗口加载状态未验证。

对话中展示最终结果图片：`screenshots/02-after-empty.png`，本轮空置顶区无说明的最终原生画面。
