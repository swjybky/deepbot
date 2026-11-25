# 弹窗 Modal

> 何时读：任何盖在主界面上的东西——表单弹窗、设置、确认。
> 代码：[`Modal.tsx`](../../apps/desktop/ui/components/Modal.tsx)（封装 `nsh/base` 的 `Dialog`）

## 结构

```tsx
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "../components";

<Modal open={modal() === "createBot"} onClose={close} width={440}>
  <ModalHeader title="创建新 Bot" onClose={close} />
  <ModalBody>…</ModalBody>
  <ModalFooter>
    <Button label="取消" onPress={close} />
    <Button variant="primary" label="创建" disabled={!canCreate()} onPress={submit} />
  </ModalFooter>
</Modal>
```

| 部分 | 规格 |
|---|---|
| 遮罩 | `overlay`（`rgba(20,20,20,0.28)`），盖满窗口；点击遮罩 = 关闭 |
| 卡片 | 居中，`rounded-dialog`（18），`bg-card`，`shadow-dialog`，`overflow-hidden`，默认淡入淡出。事项详情和遮罩在打开的首帧完整显示，关闭时一同收起 |
| `ModalHeader` | 标题 16 号 semibold + 右侧 `IconButton ghost` 关闭；`py-4 pl-5 pr-4`；底部 `border-divider` |
| `ModalBody` | `px-6 pt-[22px] pb-6`，子元素 `gap-5` |
| `ModalFooter` | 右对齐 `gap-2`，`px-4 py-3.5`；顶部 `border-divider` |
| `ModalCloseButton` | 无页眉时用：右上角 14pt 处的 `IconButton ghost` |

## 常用形态

| | 宽 × 高 | 结构 | 文件 |
|---|---|---|---|
| 表单弹窗（创建新 Bot） | 440 × 自适应 | Header + Body + Footer | `features/create-bot/CreateBotDialog.tsx` |
| 设置窗口（我的设置） | 920 × 660 | `row`：左 210 导航（`border-r border-divider`）+ 右侧滚动内容 + `ModalCloseButton` | `features/settings/SettingsDialog.tsx` |
| 资料预览 | 最宽 760，资料最高 560，记忆最高 320 | Header + 内部滚动正文，视窗四周留白。需要打开链接或管理记忆时显示操作区 | `features/bot-info/LibraryPreviewDialog.tsx` |
| Bot 规矩和例行 | 最宽 560，最高 620 | 标题带 Bot 名，滚动区展示当前 Bot 的记录和新增表单 | `features/bot-info/BotConfiguration.tsx` |
| 事项详情 | 最宽 760，最高 640 | Header + 滚动正文，执行中可在 Header 停止事项，产物预览在同一个弹窗内切换 | `features/bot-info/WorkDetail.tsx` |

输入少量信息用表单弹窗，分类较多的设置采用左右分栏，阅读较长内容时使用资料预览的滚动结构。

## 规则

- **只用 `Modal`**，不要在 `AppShell` 里绝对定位遮罩层，也不要直接用 `nsh/base` 的 `Dialog`。
- 弹窗开关由 `state/ui.ts` 的 `modal` 信号统一管理（`openModal(name)` / `closeModal()`），同一时间只开一个；新增弹窗先在 `ModalName` 里加名字，再把组件挂到 `AppShell`。
- `onClose` 负责一切关闭途径：Esc、点遮罩、关闭按钮、取消按钮都调同一个函数；关闭时重置表单状态。
- 标题是名词或动宾短语（"创建新 Bot"、"设置"），不加问号和句号。
- 页脚最多两个按钮：取消 + 一个 `primary`。纯浏览或普通偏好设置不加统一保存页脚，用 `ModalCloseButton`；模型连接编辑器仍按 [草稿规则](input.md#连接参数编辑器) 提供局部添加/保存/取消，不能因位于设置窗口就改为逐字段自动提交。
- 弹窗里不再打开弹窗。需要二次确认的破坏性操作，用 `nsh/base` 的 `AlertDialog`（系统原生确认框）。
- 内容超出高度时，滚动的是弹窗内部的内容区（`Scroll`），不是整个弹窗。
- 操作结果使用 [Feedback](feedback.md)，不往表单底部插入小字，不为成功提示打开确认弹窗。`Modal` 内置提示挂载点，保证提示出现在当前原生弹窗之上。
