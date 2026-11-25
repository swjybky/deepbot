# 分段 Tab SegmentedTabs

> 何时读：同一个地方要在 2–4 个视图之间切换（动态 / 资料库 / 配置）。
> 代码：[`SegmentedTabs.tsx`](../../apps/desktop/ui/components/SegmentedTabs.tsx)（封装 `nsh/base` 的 `Tabs` / `Tab`）

```tsx
import { SegmentedTabs } from "../components";

<SegmentedTabs
  items={[
    { value: "activity", label: "动态" },
    { value: "library", label: "资料库" },
    { value: "configuration", label: "配置" },
  ]}
  value={infoTab()}
  onChange={(tab) => infoTab.set(tab)}
/>
{infoTab() === "activity" ? <Activity /> : infoTab() === "library" ? <Library /> : <BotConfiguration />}
```

## 规格

- 容器内边距 3，Tab 间距 4，整体居中（`self-center`）。
- 每个 Tab：高 30，`px-3`，`rounded-control`，13 号字 `foreground`。
- 选中：底下有一个 `bg-muted` 的圆角指示块，切换时由原生动画滑动过去。未选中无底色，hover `bg-chip`。

## 规则

- 2–4 个选项，每个 2–4 个字。超过 4 个、或选项是"分类"而非"同一内容的不同视图"时，用竖向导航 [NavList](list.md#导航列表-navlist)（设置窗口左栏）。
- 值是 state 里的信号（`state/ui.ts` 的 `infoTab`），切换 Bot 时按需要重置。
- 内容区紧跟在 Tab 下方，只渲染当前选中的视图。
- 不要用 Tab 做表单里的单选；那是 [SelectField](select.md) 或单选网格（[list.md](list.md#单选网格)）。
