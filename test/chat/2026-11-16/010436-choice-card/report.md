# 聊天选择/确认卡片改为字母选项列表 验证记录

- 时间与时区：2026-11-16 01:04–01:20 PST
- 验证人：Claude（代理执行）
- 目标/触发条件：用户给出参照截图，要求对话中的选择卡片和确认卡片改为“粗体问题 + A/B/C 字母选项行 + 其他”样式
- 代码：Git SHA e332450，另有大量未提交改动；本次涉及 `apps/desktop/ui/components/ChoiceCard.tsx`（新增，sha256 前缀 ac1f113fc450089c）、`components/index.ts`、`features/chat/AttentionCard.tsx`（270017e4d0e6d9d6）、`FixtureApp.tsx`（新增 `choiceCards` 参数）、`tests/choice-card.test.tsx`（新增，367767bb6fccae49）、`tests/shell.test.tsx` 与 `tests/work-list.test.tsx`（选项 testID 改名）、`design/components/list.md`、`DESIGN.md`。同时段另一会话在改 `ChatPane.tsx` / `MessageBubble.tsx`（消息列填满聊天区，见 ERR-001 2026-11-16 条目），不属本次改动
- 环境：Linux 7.0.0-43-generic，GNOME Wayland（未设 GDK_BACKEND），nsh 0.4.0 (e626a8d)，窗口 1280×800 / 1280×1000，缩放 1，字体 Noto Sans CJK SC
- 数据：协议 Fixture（`FixtureApp.tsx`，`choiceCards` / `workDetail`+`longCards`），不连真实 sidecar
- 参照：用户截图（问题粗体、A–E 字母方块、悬停行灰底、末行“其他”灰字）；修改前原生截图 [01-before.png](screenshots/01-before.png)
- 总结论：代码检查通过；原生显示通过；Fixture 原生交互通过（自动点击偶发失败，见 ERR-006）；真实 sidecar 业务未验证

## 复现与预期

1. 前置：Fixture 中有批准提问 q1（批准/拒绝 + 动作说明）和决定提问 q2（四个选项）
2. 操作：查看卡片 → 悬停选项 → 点选项 → 在“其他”行输入并答复 → 长文卡片展开/收起
3. 预期：问题粗体为标题；选项带 A、B…字母；末行字母顺延为“其他”输入；点选项立即发送一次 `attention.reply`；答复后选中行黑色徽标、灰底，标题右侧“已答复”，不可再点；自定义答复显示在“其他”行；动作说明默认两行，点标题区展开全文
4. 同类入口：AttentionCard 覆盖 decision / approval / external / rule 四种提问；“打开对方页面”按钮作为 children 保留在选项下方

## 代码检查

| 命令 / 工作目录 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `pnpm check`（仓库根） | 0 | 通过 | [check.log](logs/check.log) |
| `nsh test apps/desktop` | 0 / 60 通过 | 通过（含新增 3 项与改名后的 shell、work-list 用例） | [headless.log](logs/headless.log) |
| 原生 `tests/choice-card.test.tsx --target linux`，移开真实鼠标（未加首帧等待） | 1 / 2 通过 | 失败：选项按下未生效 | [native-pointer-0.log](logs/native-pointer-0.log) |
| 同上，选项按下前等待 400ms | 第 1 轮 3/3；第 2 轮 2/3；第 3 轮 3/3 | 第 2 轮“答复”按钮按下未生效，属 ERR-006 不稳定自动点击 | [1](logs/native-pointer-1.log)、[2](logs/native-pointer-2.log)、[3](logs/native-pointer-3.log) |
| 原生 `--filter 'long cards expand'`，移开真实鼠标 | 第 1 轮 0/1（停在未改动的进度卡片展开）；第 2 轮 1/1 | 通过 | [1](logs/native-long-cards-1.log)、[2](logs/native-long-cards.log) |

unknown class 检查：本轮日志无匹配。

## 原生截图与实际对比

| 检查项与位置 | 参照/修改前图片 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 卡片整体样式 | [01-before.png](screenshots/01-before.png)（种类标题 + 灰字问题 + 胶囊按钮 + 输入框 + 答复按钮） | [02-open.png](screenshots/02-open.png) | 问题粗体作标题，选项 A/B/C… 方块字母 + 文字，末行“其他”灰字；卡片左对齐、宽 560，与参照一致 | 通过 |
| 悬停 | 参照截图 C 行灰底 | [03-hover.png](screenshots/03-hover.png) | “遇到卡点”整行圆角灰底，宽度到卡片内边 | 通过 |
| 选项答复 | — | [04-answered.png](screenshots/04-answered.png) | C 行黑底白字徽标 + 灰底，其它行灰字，右上“已答复” | 通过 |
| 其他输入 | — | [05-other-typed.png](screenshots/05-other-typed.png)、[06-other-answered.png](screenshots/06-other-answered.png) | 输入后右侧出现“答复”；答复后 C 行显示“改天再发”并选中 | 通过 |
| 长文收起/展开 | — | [07-long-collapsed.png](screenshots/07-long-collapsed.png)、[08-long-expanded.png](screenshots/08-long-expanded.png) | 收起时问题两行、动作两行省略；展开后完整显示到“完整动作结尾”，chevron 向下；选项保持在展开区外 | 通过 |

是否实际打开原图：是。截图尺寸/环境一致：是（1280×800；长文用例 1280×1000）。
实际入口点击、输入：Fixture 原生自动点击与输入通过（偶发失败如上）；真实鼠标点击未人工确认，鼠标指针形状未人工确认。
Fixture 覆盖范围：卡片显示、选择、自定义答复、展开收起、命令发送；不覆盖真实 sidecar 后端处理答复。

## 真实业务与产物

| 操作/输入 | 预期 | 实际结果 | 后端证据/产物及校验值 | 结论 |
| --- | --- | --- | --- | --- |
| 真实模型提问后在卡片上答复 | 后端收到 attention.reply 并继续 | 未执行 | — | 未验证 |

## 失败、未验证项与复验

- 原生自动点击偶发不生效（选项行、“答复”按钮、未改动的进度卡片都出现过），与 ERR-006 一致；需等待首帧并移开真实鼠标，见 [native-pointer.py](scripts/native-pointer.py)。曾怀疑 `role="radio"`，恢复该属性后多轮通过，排除
- 真实 sidecar 业务、真实鼠标指针形状：`./start.sh` 启动后让 Bot 提问，悬停选项看手形指针，点选并确认对话继续
- 关联：ERR-006、ERR-014

## 最终结论

代码检查通过；原生显示通过；Fixture 原生交互通过（自动点击不稳定，重跑通过）；真实业务未验证。

对话中展示的最终结果图片：`screenshots/03-hover.png`（未答复 + 悬停）、`screenshots/04-answered.png`（选项答复后）、`screenshots/06-other-answered.png`（自定义答复）。
