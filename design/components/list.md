# 列表与卡片

> 何时读：展示一组条目（设置项、任务、资料、Bot、导航），或做可选中的列表 / 单选网格。
> 代码：[`List.tsx`](../../apps/desktop/ui/components/List.tsx)、[`Nav.tsx`](../../apps/desktop/ui/components/Nav.tsx)

## 分组列表：SectionLabel + Group + ListRow

设计里几乎所有信息都是"灰色小标题 + 一个圆角描边分组 + 若干行"：

```tsx
import { Group, ListRow, SectionLabel, Switch } from "../components";

<SectionLabel title="系统" />
<Group>
  <ListRow title="麦克风" trailing={<SelectField … />} />
  <ListRow title="使用硬件加速" trailing={<Switch … />} />
</Group>
```

| 组件 | 规格 |
|---|---|
| `SectionLabel` | 13 号 `muted-foreground`，`px-0.5`；不是第一个时上方多 8（`first` 去掉） |
| `Group` | `rounded-card`（14）`border-border`；`density="regular"`（默认，设置）行内边距 `px-[18px] py-2.5`，`density="compact"`（Bot 信息面板）`px-3.5 py-2.5` |
| `ListRow` | `[icon / leading] 标题 / 说明 … trailing`，`gap-3`；标题 14 号单行省略，说明 12 号 `muted-foreground` |
| `Card` | 不是"行"的内容（账户、套餐、用量）：`rounded-card border-border p-[18px]`；`row` 为横排 |
| `ActionRow` | 以标题为标签的整行可点卡片 |
| `EmptyState` | 没有既定条目结构的空列表：虚线框 `border-dashed border-input`，居中 13 号必要说明；已有条目结构时见下节 |
| `IconTile` | 行首图标底块：`bg-chip rounded-control`，36（资料）或 32（保险库） |
| `StatusDot` | 8pt 圆点，`online` / `offline` |

规则：

- 分组之间的距离由父容器 `gap` 决定（面板 `gap-2`，设置 `gap-2.5`），不要给 Group 加 margin。
- 行**之间没有分隔线**，靠行内边距分开。
- 行尾控件只放一个：Switch、SelectField、`Button size="sm"`、`IconButton variant="ghost"`、StatusDot 或纯文字。右侧 Bot 信息面板只用图标，见 [面板操作](button.md#右侧-bot-信息面板的操作)。
- 整行可点击时用 `ActionRow`，不要给 `ListRow` 套 onPress。
- 列表的标题和所在分组已能说明用途时，省去提示图标，使用整行悬浮和按下反馈。状态及展开收起仍可用有明确含义的动效和图标。
- 每张资料卡片单独一个 `Group`（设计稿的资料库就是这样），条目多时考虑改成一个 Group 多行。

## 卡片网格

「我的设置 → 连接」用 `SectionLabel` 分组，复用 [TileGrid、TileCard 和 AddTileCard](../../apps/desktop/ui/components/TileCard.tsx)。分组之间与网格行列统一用 `gap-2.5`。

- `TileGrid` 按条目顺序每两个排成一行。行用 `flex-row`，通过 `flex-1 min-w-0` 单元格平分宽度，卡片填满单元格并随行等高。落单时补同宽空位。单元格负责分宽，卡片内边距和描边由内层卡片处理。展开配置的条目标记为宽卡，独占一整行。宽卡前后的普通卡各自按顺序配对。
- `TileCard` 用 `rounded-card border border-border bg-card p-4 gap-3`，最小高度 148，无阴影。页眉左侧是 36 的 `IconTile`（20 号图标），中间标题是半粗 `text-body`、副标题是弱色 `text-caption`，均单行省略。右上角是 `StatusDot` 和弱色 `text-caption` 状态。
- 可选说明用弱色 `text-label`，最多两行。信息行用 `text-caption`，键靠左用弱色，值靠右用正文色，单行省略。展开表单放在信息区域和卡片底部之间，复用外层卡片的水平内边距。
- 底部操作靠底、右对齐，按钮用 `size="sm"`、间距 `gap-2`。需要补充生效时机时，说明用左侧弱色 `text-caption`。
- `AddTileCard` 是网格末位的整卡点击入口，沿用普通卡片的尺寸与圆角，使用 `border-dashed border-input`。居中排列 36 圆形 `bg-chip` 加号、`text-body` 标题和弱色 `text-caption` 副标题。悬浮用 `hover:bg-secondary`，按下用 `active:bg-chip`。无条目时保留同一张卡，标题用「暂无…」，副标题、无障碍标签和悬浮提示说明可执行的添加操作。
- 共用组件只接收展示属性和操作回调。状态标签、图标、信息行和编辑内容由调用方提供。

## 带管理入口的空状态

已有条目样式的区域为空时，保留同类卡片的宽度、描边、圆角、图标和文字布局，显示“暂无…”，不能用独立的“管理…”按钮代替内容。没有对应条目样式的纯说明列表仍可使用 `EmptyState`。

例行面板用 `ActionRow` 显示「暂无例行」，整行可点击。悬浮用 `hover:bg-secondary`，按下用 `active:bg-chip`，手形指针由 `Pressable` 提供。`tooltip="管理例行"` 和 `accessibilityLabel="暂无例行，管理例行"` 说明操作入口。

有数据后显示例行名称、时间和开关，列表末尾用同样的 `ActionRow` 显示「管理例行」。空状态随当前 Bot 的数据变化。

## Bot 规矩与例行

- 右侧「配置」在模型配置与文件夹之间以整行卡片提供「规矩」入口。点击后打开带 Bot 名称的弹窗，关闭后回到原 Tab。
- 新增、编辑和开关针对当前 Bot。切换 Bot 后回到「动态」，再次打开配置时使用新 Bot 的记录和空草稿。
- 例行弹窗入口统一放在「动态」的「即将进行」分组。列表为空时显示「暂无例行」，有例行时在列表末尾显示「管理例行」。全局设置仅保留全局分类。
- 例行在动态列表、弹窗列表和编辑框统一显示本地 24 小时制 `YYYY-MM-DD HH:mm:ss`。
- 新增记录显示后，焦点回到添加表单的第一个输入框。规矩回到「匹配关键词」，例行回到「等待时间（分钟）」。

## 可选中的列表

选中态通过共用 `Pressable` 的 `selected` + `selected:` class 表达，读屏会读出"已选中"。

### 侧栏 Bot 行

Bot 行、置顶/隐藏和右键操作见 [侧栏约束](../sidebar.md#bot-行与分组)。

### 账户行与类似的头像入口

头像、留边和悬浮背景范围见 [账户行](../sidebar.md#账户行与头像入口)。

### 导航列表 NavList

设置窗口左栏：

```tsx
<NavList>
  {sections.map((s) => (
    <NavItem label={s.label} icon={s.icon} selected={current() === s.id} onPress={() => current.set(s.id)} />
  ))}
</NavList>
```

`NavItem`：高 38，`rounded-field px-3 gap-2.5`，图标 17（线宽 1.7，`icon-foreground`）+ 14 号文字；hover `bg-chip`，选中 `bg-nav-active`。
用于"切换右侧整块内容"的分类导航；只切换同一内容的视图用 [SegmentedTabs](tabs.md)。

### 单选网格

一组视觉化的单选项（创建 Bot 的形状和颜色）。容器 `role="radiogroup"` + `accessibilityLabel`，每项是 `Pressable role="radio" selected={…}`，并给 `accessibilityLabel`：

| | 形状 | 颜色 |
|---|---|---|
| 项 | 50 圆，内放 40 头像 | 26 圆，底色即颜色 |
| 选中 | `selected:border-ring`（1.5 描边） | 双圈：`boxShadow: "0 0 0 2px #FFFFFF, 0 0 0 3.5px #A3A3A0"` |
| 排布 | 宽 300，`flex-wrap justify-center gap-1.5` | 宽 260，行距 12 列距 14 |

## 长列表

条目数不确定（Bot、消息、资料）一律用 `<Each of={…} key={…}>`，key 用稳定 id；数量固定的静态数组可以用 `.map`。
上千条的列表换成 `nsh` 的 `List`（虚拟化）。

## 长文本摘要与详情

2026-11-13 遇到的典型问题：事项卡片直接展示完整进度长文，一张卡片占据大块面板，其它事项被挤到下面；进行中与已结束的事项还混在同一列表。列表承担浏览与定位，全文放在详情中阅读。

- 列表、概览卡片遇到长度不确定的正文，必须限制摘要行数，并提供点击进入详情或展开全文的入口；不能让文本无限撑高卡片。
- 事项列表只显示标题，用 `line-clamp-1` 单行省略。完整标题、进度和目标在事项详情中阅读。
- 详情的目标、验收、进度和提问动作说明默认标题单行、正文两行，点标题或摘要可展开后收起。资料正文统一在弹窗阅读。
- **验收以实际显示为准**：用超长标题和多行正文检查列表单行省略、详情两行摘要、全文展开与返回。使用原生窗口核对截断和布局。事项回归见 [work-list.test.tsx](../../apps/desktop/tests/work-list.test.tsx)。

## 运行事项与提问卡片

`ActivityCard` 是通用卡片容器（`rounded-card border-border bg-card p-3.5 gap-2.5`），标题与状态同行，说明用 `text-label text-muted-foreground`。组件本身不依赖执行协议。

- 列表卡片传 `onPress` 时整张卡片可进入详情，hover `bg-secondary`，按下 `bg-chip`，并给 `accessibilityLabel`（默认用标题）。事项列表省去行尾进入箭头。
- 列表卡片传 `onPress` 进入详情；带正文的详情卡片默认显示两行摘要，点标题或摘要展开全文。标题右侧用 chevron 显示展开状态，标签为“展开/收起 + 标题”。
- 提问批准、拒绝和答复操作放在展开区域之外。长动作说明与提问正文合并到可展开内容。
- 动态依次显示「事项」「即将进行」「电脑」「已结束」。结束状态为 `ended` 的事项自动移到「已结束」。该分组用 `DisclosureRow`，打开动态页时默认折叠，向下箭头表示可展开，向上箭头表示可收起。两组条目均可进入详情。
- 执行中的事项通过 `statusIndicator` 在标题右侧显示三个中性呼吸圆点，缩减动态效果时只改变透明度。其它阶段的状态随标题提供给读屏，状态文字可在详情中查看。
- 事项列表位于右侧「动态」。点 `ActivityCard` 打开详情弹窗，继续用可展开卡片展示目标和进度，改派选择放在 `ListRow.trailing`，未结束时在弹窗页眉显示停止图标。关闭后保留原列表的折叠和滚动状态。聊天由 Bot 发消息回执。
- 提问卡片留在聊天（`features/chat`），用下面的 [选择卡片](#选择卡片choicecard)，不用 `ActivityCard` 加按钮。

## Bot 资料库与记忆

- 资料库页先显示「记住的事」，下方显示「保存的资料」。
- 文件、文字、链接和记忆使用 `ActionRow` 单行显示。点整行打开资料预览弹窗，正文在弹窗内阅读，列表省去展开和打开图标。事项弹窗里的产物沿用同样的预览内容，在当前弹窗切换预览页，返回箭头回到事项。
- 文件预览按关联产物路径读取本地正文，文本和常见图片直接显示。较长文本提供开头预览和系统应用入口，无法内置显示的格式提供对应状态和系统应用入口。链接在弹窗中显示地址，由用户决定是否打开。
- 每个 Bot 的记忆在「记住的事」分组内展示。弹窗同时提供编辑和删除，列表末尾用占位输入框与加号添加。切换 Bot 时记忆列表和添加目标同步更新。

## 选择卡片：ChoiceCard

聊天里的选择和确认（决定、批准、对方在等你、确认规矩）统一用 `ChoiceCard`：问题本身作标题，下面一列带字母的选项，最后一行是“其他”输入。

```tsx
<ChoiceCard question={q.question} detail={动作说明} options={q.options} answer={已答复时的值} pending={提交中} onChoose={send} label="需要你批准" testID={`attention-${q.id}`} />
```

- 容器 `w-full max-w-[560px] self-start rounded-card border-border bg-card p-2 gap-1`：靠左，和 Bot 消息对齐；消息列再宽也不超过 560。
- 标题 `text-body font-semibold`，最多两行；有动作说明（`text-label text-muted-foreground`，两行）或问题过长时，整个标题区是展开/收起按钮，标签“展开/收起 + label”，chevron 在右上。
- 选项行 `Pressable role="radio"`：`rounded-row px-2 py-[7px] gap-3`，hover `bg-chip`、按下 `bg-muted`，左侧 24 方块字母徽标（`rounded-control border-edge`，`text-caption text-muted-foreground`），选项文字 `text-body text-foreground`。点一下就答复，不再要“确认”按钮。
- 最后一行字母顺延，内嵌无框输入，占位“其他”（`faint-foreground`）；有内容时右侧出现 `Button size="sm"`“答复”，回车同样提交。
- 提交中所有行禁用，已点的行保持选中。已答复后只保留选中的那一行（字母保持原序号，自定义答复用“其他”的字母），其它选项和输入全部隐藏；问题文字变为 `muted-foreground` 表示已答，不另加“已答复”字样。
- 选中的字母徽标用**当前 Bot 的颜色**（`accent`，由业务传入 `accentColor()`，组件内经 `botFill` 压暗）填充、白字；未传时退回 `primary`。
- 额外操作（打开对方页面）作为 children 放在选项下方。测试 ID：`<testID>-option-<选项>`、`-input`、`-submit`、`-toggle`。回归见 [choice-card.test.tsx](../../apps/desktop/tests/choice-card.test.tsx)。
- 外部请求按照请求 ID 显示。审批卡显示具体动作和可用决定，支持在原卡上打开 T3 Code。只支持外部处理时保留一个打开入口，随后按远端状态更新。
- 外部单选问题点选即答。多问或多选放在同一张卡里，每问保留原选项，整卡提交一次。仅在原问题允许时提供自定义回答。远端接收答复前保留提交中状态，成功后在原卡显示答案。

## 提供方折叠列表

模型配置采用一个 Card 容器，顶部为数量摘要与添加入口；按提供方分组，使用 `DisclosureRow` 显示模型图标、名称、数量与展开箭头，初始收起。分组之间允许细分界线；组内用左侧浅描边引导层次，不叠加多层卡片。

展开后展示模型名称、默认徽标、模型/API 与认证摘要，操作使用项目 Button 的 ghost 小号样式。仅点击添加或编辑时出现两列草稿表单；折叠分组保留未保存草稿。组件不读取业务状态，业务分组和开关信号留在 settings 功能内。

## 侧栏跨区拖动

跨区拖动、空置顶接收空间和状态验收见 [侧栏约束](../sidebar.md#跨区拖动)。

## 内容状态验收

- 用超长标题、多段正文检查默认摘要、展开全文和再次收起；事项列表点击进入详情，卡片内操作不触发折叠。
- 同时放入进行中和已结束事项，检查置底、默认折叠和展开收起、运行状态动效、状态更新移组，以及已结束详情的停止入口已移除。
- 例行分别检查空列表、已有数据、切换 Bot；空状态保留条目结构且整行可进入管理，无多余管理按钮。
- ChoiceCard 检查未答复、提交中、已答复、自定义答复：答复后只留所选行，问题弱化、字母序号不变，不追加“已答复”小字。
- 右侧三个 Tab 检查条目同行图标、列表末尾模块操作；记忆按 Bot 隔离，保存、删除及重启读回另验真实后端。
- 必须实际查看原生截图；只检查文本存在不能证明摘要行数、分组和控件位置正确。完整流程见 [verify 技能](../../skills/verify/SKILL.md)。
