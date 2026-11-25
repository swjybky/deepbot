# Bot 头像：创建弹窗默认果冻 + 眼睛改为 1:1.8 并放大 验证记录

- 时间与时区：2026-11-15 18:38（本机时区）
- 验证人：Claude（Claude Code）
- 目标/触发条件：「创建新 Bot」弹窗的默认形状由珊瑚 `flower` 改为果冻 `jelly`；另出几种更圆眼睛的效果图；用户选 A（1:1.8）并要求再大一圈，眼睛由 3.7×8.8 改为 5×9 网格单位，两眼中心距 10.6 → 12.4
- 代码：Git SHA e332450；本次改动 `apps/desktop/ui/features/create-bot/CreateBotDialog.tsx`（默认形状）、`apps/desktop/ui/components/BotAvatar.tsx`（眼睛尺寸）、`design/components/avatar.md`；效果图与注视方向检查用的临时组件和 Fixture 已删除
- 环境：Linux，NSH 0.4.0，Wayland，原生测试窗口 1280×800 / 760×760，1 倍缩放
- 数据：FixtureApp.tsx（Fixture，不连接 sidecar）
- 总结论：代码检查通过；原生显示通过；原生点击「+」打开弹窗失败（ERR-006），改为在临时 Fixture 中直接打开弹窗后截图

## 代码检查

| 命令 / 工作目录 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `pnpm check`（仓库根目录） | 0 | 通过 | [check.log](logs/check.log) |
| `nsh test apps/desktop` | 0 / 54 通过 | 通过 | [headless.log](logs/headless.log) |
| `nsh test --target linux --filter avatar`（apps/desktop） | 0 / 5 通过 | 通过 | [native-avatar.log](logs/native-avatar.log) |

unknown class 检查：日志中未发现。

## 原生截图与实际对比

| 检查项与位置 | 参照 | 本次原生图片 | 实际查看结果 | 结论 |
| --- | --- | --- | --- | --- |
| 创建弹窗默认形状 | [上一轮截图](../../2026-11-13/014408-jelly-shape-3d/screenshots/02-after-create-bot.png)（默认珊瑚） | [create-bot-default-jelly.png](screenshots/create-bot-default-jelly.png) | 预览是果冻，网格第一个被选中 | 通过 |
| 圆眼效果对比（现在 / A 1:1.8 / B 1:1.5 / C 1:1.2 / D 圆形） | 当前眼睛（第一行） | [eye-variants.png](screenshots/eye-variants.png) | 越圆的方案眼睛也稍大，以保持存在感 | 用户选 A |
| 采用 A 并放大：全部形状、颜色、尺寸 | [上一轮](../../2026-11-13/014408-jelly-shape-3d/screenshots/02-after-avatars.png) | [eyes-a-larger-avatars.png](screenshots/eyes-a-larger-avatars.png) | 眼睛更圆更大，30pt 下仍清楚，没有粘连 | 通过 |
| 采用 A 并放大：侧栏、置顶、顶部胶囊 | [上一轮](../../2026-11-13/014408-jelly-shape-3d/screenshots/02-after-app.png) | [eyes-a-larger-app.png](screenshots/eyes-a-larger-app.png) | 布局不变，眼睛无溢出 | 通过 |
| 13 种形状 × 9 个注视方向（临时 Fixture 固定注视方向） | — | [eyes-a-larger-look-directions.png](screenshots/eyes-a-larger-look-directions.png) | 放大查看水滴、珊瑚、贝壳：转到上、下、左、右和四个斜角时，眼睛都完整留在身体内 | 通过 |

是否实际打开原图：是。
实际入口点击：原生点「+」两次都失败（ERR-006）；临时 Fixture 直接打开弹窗，没有经过点击。

## 失败、未验证项与复验

- 原生点击入口未验证：`./start.sh` → 点「+」→ 确认默认选中果冻 → 创建
- 关联 ERROR.md 条目：ERR-006

## 最终结论

代码检查：通过。原生显示：通过。实际交互：未验证（ERR-006）。真实业务：不适用。
对话中展示的最终结果图片：eye-variants.png、eyes-a-larger-avatars.png、eyes-a-larger-look-directions.png、create-bot-default-jelly.png。眼睛跟随鼠标的实际悬停没有在原生窗口里验证（ERR-006），注视方向由临时 Fixture 固定后截图。
