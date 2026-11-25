# 侧栏 Bot 与拖动

> 何时读：修改 Bot 列表、置顶/隐藏、账户入口，或拖动和悬浮效果。
> 代码：[`Sidebar.tsx`](../apps/desktop/ui/features/sidebar/Sidebar.tsx)、[`DragSource.tsx`](../apps/desktop/ui/components/DragSource.tsx)（含 DragPreview）。

## Bot 行与分组

`features/sidebar/Sidebar.tsx` 的 `BotRow`：`rounded-row px-2.5 py-[9px] gap-3`，头像 42，名字 14 semibold + 最后一条消息 12.5 单行省略；
hover `bg-sidebar-accent/60`，选中 `bg-sidebar-accent`。Bot 列表在 `Scroll` 里，行间 `gap-0.5`，用 `<Each of={…} key={b => b.id}>` 渲染。

侧栏分三段，顺序由 `state/bots.ts` 的 `pinnedBots / otherBots / hiddenBots` 决定，界面不自己排序：

- **置顶**：列表上方的头像格（`w-24` 卡片，`flex-row flex-wrap justify-center`），按置顶时间先后（`pinnedAt`）。
- **普通**：按最近活动倒序（最后一条消息时间，没有消息用 `createdAt`）。
- **已隐藏的 Bot**：列表底部的折叠标题（`sidebar-hidden-toggle`，默认收起），展开后用同样的 `BotRow`。置顶和隐藏互斥。

未读：Bot 一侧有晚于已读时间的新消息，或用户手动标为未读。普通行在名字右侧显示 8pt `bg-primary` 圆点，置顶格在头像右上角显示 14pt 圆点（`border-2 border-card`）。打开 Bot 即为已读，正在看的 Bot 收到新消息不算未读。已读状态只存在本机（`state/unread.ts`，NSH Storage），不进后端协议。

每个 Bot 右键弹出原生菜单（`Menu.popup`，`nsh/desktop`）：置顶 / 取消置顶、标为未读 / 标为已读、重命名 Bot（`RenameBotDialog`，表单弹窗）、复制对话 ID、从侧边栏隐藏 / 在侧边栏显示、删除（`AlertDialog` 二次确认）。
`nsh/base` 的 `Button` 不接受 `onContextMenu`，由外层 `View` 监听。状态写回后端：`bot.upsert` 带 `pinned` / `hidden` / `name`，删除用 `bot.delete`；时间戳只由后端写。

## 账户行与头像入口

头像与名字始终显示；悬浮背景覆盖整条可点击行，包括文字右侧的空白，而不是只包住头像和名字。
“整行”指容器留白以内的可用宽度，背景左右必须留边，上下也保留空白，不铺满整个底部区域。

侧栏账户入口使用以下规格（依据用户提供的头像账户行参考图）：

- 外层 `px-2 py-3.5`：左右各留 8pt，上下各留 14pt；不画顶部分隔线。
- 可点击行 `w-full rounded-field px-2 py-1 gap-2.5`：34pt 头像决定内容高度，上下各 4pt 内边距，总高 42pt；圆角 10pt。
- 默认透明，悬浮 `bg-sidebar-accent/60`，按下 `bg-sidebar-accent`；头像与名字的位置和内容不随悬浮变化。
- 点击与悬浮使用同一个行容器；类似的头像入口、账户切换行采用同样的留边和背景范围原则，具体头像尺寸按所在场景确定。

实现见 `features/sidebar/Sidebar.tsx` 的 `sidebar-account`。不要把背景放在带大块上下留白的外层，也不要去掉头像或悬浮反馈来缩小背景。

## 跨区拖动

普通 Bot 行与置顶磁贴使用共用 `DragSource` 捕获移动超过 6pt 的手势；点击与右键保留。源条目降低透明度，并在拖动期间移除自身的选中和悬浮背景（保留选中状态）；`DragPreview` 跟随指针并在 140ms 内轻微放大，只有可接收的跨组目标区域用 sidebar-accent 高亮，源分组和区外均不显示拖动背景；松开后调用现有置顶命令，落入新分组时以 180ms 缩放到位。不使用全局 LayoutAnimation，避免聊天重排动画。减少动态效果时跳过缩放。

置顶为空且未拖动时收起整个置顶内容，普通列表直接上移；开始拖动后展开置顶接收空间，普通 Bot 进入该区后才显示高亮背景。松开或取消后，若仍无置顶则收起；普通区为空时仍保留接收空间。拖动中用头像预览和目标高亮表达操作，不在左下方或空置顶区显示解释操作的小字，遵循 [提示取舍](components/feedback.md#何时不显示提示)。区域边界在按下时测量，并在拖动展开置顶区后的下一帧重新测量；松开前使用展开后的边界确定落点，再清理拖动状态，拖到区外或 responder 终止不改变数据。只在跨组松开时保存，组内拖动沿用既有排序；隐藏 Bot 保留右键操作。

## 状态验收

| 状态 / 操作 | 可观察结果 |
| --- | --- |
| 拖走最后一个置顶，或右键取消置顶 | 置顶区连同 padding/min-height 收起，普通列表上移，无空白块 |
| 从普通列表拖起，当前没有置顶 | 接收空间展开；进入置顶区才高亮，重新测量后投放正确 |
| 从选中/悬浮的普通行或置顶格拖起 | 源条目无选中/悬浮背景，业务选中状态保留；头像预览跟手 |
| 跨区命中、同组、区外、取消 | 仅有效目标高亮；同组、区外及取消不改变分组；松开恢复正常选中背景 |
| 松开后切 Bot、重开应用 | 本轮分组更新正确；涉及保存时另验真实后端及重启读回 |
| 悬浮账户行 | 头像和名字保留，行内空白也高亮，容器四周仍留边，无顶部分隔线 |

拖动取开始、中间、松开后的原生关键帧；松开后的静态截图不能证明拖动中的源背景已移除。截图与真实数据验收边界见 [verify 技能](../skills/verify/SKILL.md)。
