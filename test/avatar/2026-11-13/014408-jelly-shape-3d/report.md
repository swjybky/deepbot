# Bot 头像：果冻形状、立体感与眼睛位置 验证记录

- 时间与时区：2026-11-13 01:44（本机时区）
- 验证人：Claude（Claude Code）
- 目标/触发条件：按用户参照图（[00-reference.webp](screenshots/00-reference.webp)）新增扁圆的果冻形状并排在形状列表第一位；加强所有头像的 3D 立体感；眼睛整体下移
- 代码：Git SHA e332450；相关未提交改动 `apps/desktop/ui/theme/avatar.ts`、`apps/desktop/ui/components/BotAvatar.tsx`、`apps/desktop/AvatarFixture.tsx`、`design/components/avatar.md`（`ui/` 整体尚未纳入版本库）
- 环境：Linux，NSH 0.4.0 (e626a8d)，Wayland 会话，NSH 原生测试窗口 1000×480 / 1280×800，1 倍缩放
- 数据：AvatarFixture.tsx、FixtureApp.tsx（Fixture，不连接 sidecar）
- 参照：用户提供的参照图；修改前版本（临时恢复旧代码重新渲染得到的 01-before 截图）
- 总结论：代码检查通过；原生显示通过；形状选择的原生点击未单独验证（见下文）

## 复现与预期

1. 前置条件：Fixture 列出所有形状、颜色和尺寸
2. 操作：`nsh test apps/desktop --target linux --filter avatar`；临时用例原生打开「创建新 Bot」弹窗
3. 预期：果冻形状宽大于高（约 41×35.5，1.15:1）、鳍偏右；所有形状的中心更深、边缘透亮、左上有亮边、底边微亮；眼睛比原来低 2.4 个网格单位，且所有形状里都完整显示；果冻排在形状网格第一位
4. 同类入口：侧栏行、置顶格、对话区顶部胶囊、创建弹窗预览与形状网格共用 BotAvatar，一并检查

## 代码检查

| 命令 / 工作目录 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `pnpm check`（仓库根目录） | 0 | 通过 | [check.log](logs/check.log) |
| `nsh test apps/desktop` | 0 / 54 通过 | 通过 | [headless.log](logs/headless.log) |
| `nsh test --target linux --filter avatar`（apps/desktop） | 0 / 5 通过 | 通过 | [native-avatar.log](logs/native-avatar.log) |

unknown class 检查：日志中未发现。
另外跑了一次完整的 `--target linux`：49/54 通过，失败的 5 项是 floating-header、markdown、shell 中依赖原生点击/悬停的用例，属已知的 [ERR-006](../../../../error/linux-native-input.md)，与头像无关；headless 全部通过。

## 原生截图与实际对比

| 检查项与位置 | 参照/修改前图片 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 全部形状、颜色、尺寸 | [01-before-avatars.png](screenshots/01-before-avatars.png) | [02-after-avatars.png](screenshots/02-after-avatars.png) | 顶行改为果冻形状，宽大于高、不再竖向拉长；各形状中心更深更饱和、边缘浅亮、左上亮边和底边透光明显；眼睛下移后在水滴、六角、贝壳等窄形状内仍完整显示；30pt 也清晰 | 通过 |
| 侧栏、置顶、顶部胶囊 | [01-before-app.png](screenshots/01-before-app.png) | [02-after-app.png](screenshots/02-after-app.png) | 布局不变，头像立体感增强，无溢出 | 通过 |
| 创建新 Bot 形状网格 | — | [02-after-create-bot.png](screenshots/02-after-create-bot.png) | 果冻位于第一位；13 个形状按 5/5/3 居中排列，没有挤压 | 通过 |
| 与参照图对比 | [00-reference.webp](screenshots/00-reference.webp) | 另在 300pt 下临时渲染检查（未归档） | 整体轮廓、鳍的位置、深色中心配浅色边缘一致；参照图的眼睛更粗、间距更大，以及头像下方的投影，本次没有照搬（规格规定眼睛宽高约 1:2.4，头像不加阴影） | 通过（差异已说明） |

是否实际打开原图：是。截图尺寸/环境是否一致：一致（同一 Fixture、同一窗口尺寸）。
实际入口点击、输入、保存和持久化结果：弹窗由临时原生用例打开，截图通过；没有单独验证在原生窗口里点选果冻形状并创建 Bot。
Fixture 覆盖范围与真实业务覆盖范围：仅为 Fixture 显示；形状 id `jelly` 只在前端使用，agent 端不校验形状。
动画关键帧/录屏（如适用）：不适用（眼睛跟随逻辑未改）。

## 真实业务与产物

不适用：只改了头像绘制和形状列表，没有改动后端或协议。

## 失败、未验证项与复验

- 缺失环境/失败步骤：原生点击不稳定（ERR-006），未在真实窗口中点选果冻并创建 Bot
- 影响范围：仅涉及形状选择的交互；显示已验证
- 下一轮具体复验命令与人工操作：`./start.sh` → 点「+」→ 选第一个形状 → 创建，确认侧栏新 Bot 显示果冻形状
- 关联 ERROR.md 条目（如适用）：ERR-006

## 最终结论

代码检查：通过。原生显示：通过。实际交互：形状点选未验证。真实业务：不适用。

对话中展示的最终结果图片：02-after-avatars.png（全部形状）、02-after-create-bot.png（形状网格），已在对话中展示。
