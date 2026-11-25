# 开关 Switch

> 何时读：一个立即生效的开 / 关设置。
> 代码：[`Switch.tsx`](../../apps/desktop/ui/components/Switch.tsx)（封装 `nsh/base` 的 `Switch`）

```tsx
import { ListRow, Switch } from "../components";

<ListRow
  title="打开对话时展开 Bot 信息"
  description="关闭时，点击头像才会拉出右侧信息"
  trailing={
    <Switch
      label="打开对话时展开 Bot 信息"
      checked={prefs().autoOpenInfo}
      onChange={(on) => setPreference("autoOpenInfo", on)}
    />
  }
/>
```

## 规格

- 轨道 40 × 24，`rounded-full`，内边距 3；滑块 18，白色，`shadow-thumb`，打开时右移 16。
- 关：轨道 `track`（`#D9D9D6`）。开：轨道 `primary`（中性黑）。开关只出现在设置与面板里，不跟随 Bot 颜色（见 [强调色](../tokens.md#强调色)）。
- 颜色和位移都有过渡动画（组件内部已处理）。
- 禁用：整体 50% 不透明。

## 规则

- 只放在 `ListRow` 的 `trailing`，行标题说明它控制什么；`label` 必填且与行标题一致。
- 开关**立即生效**，没有"保存"按钮。需要确认才能生效的选项不要用开关。
- 行标题写"开启后的状态"（"输入时检查拼写"、"允许删除文件"），不要写成问句或"是否……"。
- 有副作用需要解释的，用 `description` 写一行说明（12 号 `muted-foreground`）。
- 定时任务的开关：description 显示状态（"运行中 · 每天" / "已暂停"），随开关变化。
- 三种以上状态用 [SelectField](select.md)。
