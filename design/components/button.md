# 按钮 Button / IconButton

> 何时读：放任何可点击的操作。
> 代码：[`Button.tsx`](../../apps/desktop/ui/components/Button.tsx)、[`IconButton.tsx`](../../apps/desktop/ui/components/IconButton.tsx)

文字操作按钮和图标按钮都是**胶囊 / 圆形**（`rounded-full`）。列表与账户行使用 [列表约束](list.md) 的行圆角和悬浮范围。

## Button：文字按钮

```tsx
import { Button } from "../components";

<Button label="添加电脑" onPress={add} />                       // secondary, md
<Button size="sm" label="退出登录" onPress={signOut} />          // 卡片 / 设置行里
<Button variant="primary" label="创建" disabled={!ok()} onPress={submit} />
```

| variant | 外观 | 用在 |
|---|---|---|
| `secondary`（默认） | `bg-secondary` + `border-edge`，文字 `foreground` | 绝大多数操作：添加、管理、检查更新、取消 |
| `primary` | `bg-primary`，白字；禁用时 `bg-nav-active` + `faint-foreground` 字 | **每个弹窗最多一个**的确认操作（创建、保存） |
| `ghost` | 无底无框，hover `bg-chip` | 低强调的附加操作 |

`primary` 可传 `color`（只在对话区，传 `accentColor()`）：启用时底色为 `botFill(color)`，仍是白字；禁用时同普通主按钮。目前只有输入条「发送」使用；设置、弹窗里的主按钮不传，保持黑色。

| size | 高 | 内边距 | 字号 | 用在 |
|---|---|---|---|---|
| `sm` | 34 | `px-3.5` | 13 | 卡片和设置行内部 |
| `md`（默认） | 36 | `px-4`（primary 18） | 14 | 弹窗页脚、独立操作（列表下方的"添加 xx"） |

规则：

- 文案是动词短语，2–4 个字："创建"、"添加电脑"、"检查更新"。不要写"确定"、"OK"。
- 弹窗页脚：次要在左、主要在右，`justify-end gap-2`（由 `ModalFooter` 负责）。
- 在列表下方单独放的按钮要包一层 `<View class="flex-row">`，否则会被拉满整行宽。
- 暂时不可用时用 `disabled`，保留位置；业务状态已无此操作时移除入口，例如已结束事项不显示停止。破坏性文字按钮用 `secondary`，靠二次确认；停止图标的红色中心方块按下节约束。
- 删除入口因默认配置、业务引用或运行事项受保护时，可保持可点击以解释原因：点击只调用 `notify("warning", ...)`，写明解除保护的步骤，不发送删除命令、不打开删除确认框。保存、编辑等临时互斥状态仍用 `disabled`；后端保留同样的删除校验。

## IconButton：图标按钮

```tsx
import { IconButton } from "../components";

<IconButton icon="plus" label="创建新 Bot" onPress={create} />           // outline 36
<IconButton icon="close" variant="ghost" label="关闭" onPress={close} /> // 弹窗关闭 32
<IconButton icon="mic" variant="soft" label="语音输入" />                 // 输入条内 32
<IconButton icon="waveform" variant="solid" label="语音聊天" />           // 输入条主操作 36
```

| variant | 尺寸 | 外观 | 图标 | 用在 |
|---|---|---|---|---|
| `outline`（默认） | 36 | `bg-card border-edge` | 18，`foreground` | 工具栏：搜索、新建、分享、应用、关闭面板 |
| `ghost` | 32 | 透明，hover `bg-chip` | 16，`icon-foreground` | 弹窗右上角关闭 |
| `soft` | 32 | `bg-chip` | 16，`icon-foreground`，线宽 2 | 输入条里的次要操作 |
| `solid` | 36 | `bg-primary` | 18，白色，线宽 2 | 输入条的主操作（一个输入条只有一个） |

规则：

- `label` 必填：它是读屏文字，也是鼠标悬停的提示。
- 图标只能来自 [icon.md](icon.md) 的图标表。
- 同一行的多个图标按钮间距 `gap-2`。
- 不把“图标化”扩大到所有页面：右侧面板的条目操作、返回、停止、消息回复按各自规则使用图标；设置和表单仍保留清楚的文字主操作。

## 右侧 Bot 信息面板的操作

右侧「动态 / 资料库 / 配置」三个页面不放文字按钮（2026-11-16 用户要求），按操作的对象分两类：

- **针对某一条目的操作**（例如移除文件夹）可用同行的 `ListRow.trailing` 和 ghost `IconButton`，标签写明动作和对象。资料和记忆用整行打开预览，对应操作位于弹窗内。
- **针对整个模块的操作**（管理例行、添加记忆、关联文件夹）接在模块列表末尾。进入管理详情用整行 `ActionRow`，就地添加在输入控件旁放 `plus` 图标按钮，回车同样提交，必填内容无效时图标 `disabled`。
- 模块空状态沿用 [列表空状态](list.md#带管理入口的空状态)。面板外（设置窗口、弹窗页脚）的文字按钮不受此节影响。

`IconButton` 的 `disabled` 让图标变淡（`disabled:opacity-40`）、恢复箭头指针，按钮保留原位。

## 返回导航

- 全项目返回上一级统一用 `<IconButton icon="arrowLeft" label="返回事项" onPress={back} />`；`label` 按实际返回目标命名，仅作读屏文字和悬停提示，不显示文字按钮。
- 使用默认 `outline`：36pt 圆形描边按钮，18pt 左箭头，与面板关闭等顶部操作保持一致。
- 有上一级内容时，返回图标位于内容导航行，顶部叉号独立关闭当前容器。事项弹窗仅在预览产物时显示返回图标，返回事项详情，叉号关闭整个弹窗。
- 验收检查返回与关闭的位置、无障碍标签，以及返回或关闭后恢复的内容。

## 事项停止

未结束事项使用 `<IconButton icon="stop" label="停止事项" ... />`，默认 `outline`，位于事项弹窗页眉的关闭图标左侧，间距 `gap-2`。状态转为已结束后立即隐藏停止入口。

停止图标中心方块统一使用 `feedback-error` 红色实心填充，由 `IconButton` 共用组件处理；外圈仍为原来的白底圆形浅描边，不将整个按钮涂红。

## 其它可点击的东西

需要整块可点（列表行、磁贴、胶囊、单选项）时，用 `components/` 的 `Pressable` 自己布局，并且：

- 必须有 hover 和按下反馈：`hover:bg-… active:bg-…`（或 `active:opacity-80`）；
- 选中态用 `selected` 属性 + `selected:` class，不要用三元表达式拼 class；
- 没有可见文字时给 `accessibilityLabel`。

现有例子见 [list.md](list.md)。

## 鼠标指针

`nsh/base` 的 `Button`、`Tab`、`Switch`、`Select` 都不设指针，默认 `auto` 和浏览器一样：在文字上显示文本光标（I 形），在空白处显示箭头。所以可点击元素必须自己声明手形指针，否则鼠标放在「小菜」胶囊这类带文字的按钮上会像能选中文字。

- **不要直接用 `nsh/base` 的 `Button`**，用 [`Pressable`](../../apps/desktop/ui/components/Pressable.tsx)：它和原组件属性相同，并固定加上 `pressCursor`（`cursor-pointer disabled:cursor-default`）。`Button`、`IconButton`、`ListRow`、`NavItem`、`DisclosureRow`、`ActivityCard` 都已建在它上面。
- `Pressable` 自带 `select-none`，让可跨气泡选中文字的聊天区也能在按钮文字上显示手形。提问卡片的可展开标题、选项、答复按钮都走这套规则。输入框放在独立的可编辑区域，正文仍由消息区处理文字选择。
- 封装其它会被点击的 `nsh/base` 控件时，把 `pressCursor` 加到能被点到的那一层：`Tab` 和 `Switch` 加在自身 `class`，`Select` 加在 `trigger` 的 View 上（trigger 不受 `disabled:` 影响，禁用时不加）。
- 禁用时恢复箭头，不用 `not-allowed`。
- 只有拖动柄用别的指针（`ResizableColumns` 的 `col-resize`）；不可点的文字、卡片保持默认，不要为了“统一”加手形。
- 指针形状在 headless 测试里读不到，改动后在 `nsh run` 里把鼠标放到按钮文字上确认。提问卡片还需确认「其他」输入框显示 I 形光标。
