# 下拉选择 SelectField

> 何时读：从固定的几个选项里选一个（主题、语言、默认 Bot、语音、速度……）。
> 代码：[`SelectField.tsx`](../../apps/desktop/ui/components/SelectField.tsx)（封装 `nsh/base` 的 `Select`）

```tsx
import { SelectField } from "../components";

<ListRow
  title="主题"
  trailing={
    <SelectField
      accessibilityLabel="主题"
      value={prefs().theme}
      onChange={(v) => setPreference("theme", v as Theme)}
      options={[
        { value: "system", title: "跟随系统" },
        { value: "light", title: "浅色" },
        { value: "dark", title: "深色", disabled: true },
      ]}
    />
  }
/>
```

## 规格

触发器（设计稿里"跟随系统 ⌄"那种小按钮）：

| | `md`（默认） | `sm` |
|---|---|---|
| 高 | 30 | 28 |
| 左内边距 | 12 | 10 |
| 用在 | 设置（920 宽弹窗） | Bot 信息面板（320 宽） |

共同：`rounded-control`（8），`border-edge`，`bg-card`，hover `bg-secondary`；文字 13 号 `foreground`；末尾 12pt 的 `chevronDown`（`muted-foreground`，线宽 2）。
可选 `swatch`：标题前 10pt 色点（只用于强调色）。

弹层：右对齐触发器（`align="end"`），间隔 4，最小宽 160，`rounded-row`，`border-edge`，`bg-popover`，`shadow-popover`，`p-1`；
选项 13 号字，`rounded-control px-2.5 py-1.5`，高亮 `bg-chip`，已选中加粗。

## 规则

- **放在行尾**：SelectField 总是作为 `ListRow` 的 `trailing`，行标题就是它的说明，`accessibilityLabel` 与行标题相同。不要单独放在页面里。
- 选项 2 个以上、能一眼看完（≤ 10 个）时用它。只有开 / 关两态用 [Switch](switch.md)；选项多到需要搜索，用 `Select` 的 `searchable`（先在 SelectField 上加参数，不要在屏幕里直接用 `Select`）。
- 选项标题用名词，短：`跟随系统`、`简体中文`、`1x`。触发器显示的就是选中项的标题，不要另写文案。
- 暂不可用的选项 `disabled: true` 显示出来，不要删掉。
- 值是稳定的 id（`"system"`、`bot.id`），不是显示文字。

## 表单中的选择

两列参数编辑器及右侧 Bot 配置使用 `FormField` 的可见标签和 `SelectField form`：控件撑满列宽、高 40，与 TextField 对齐；仍保留项目描边、圆角和下拉弹层。它是行尾模式的明确例外，不再嵌套 ListRow。右侧窄栏的模型选择独占一行，长名称单行省略，不挤占标签宽度。动态模型目录用 `searchable`；需要暂时不可用时传 `disabled`。

## 表单多选

`MultiSelectField` 使用同高的表单触发器。弹层内搜索可滚动的选项列表，整行可勾选或取消，搜索时保留已选项。底部显示已选数量，点「完成」收起；单项时触发器显示选项名，多项时显示数量。

添加模型时，名称留空且已拉取目录才可多选。填写名称时切回单选并保留最先勾选的模型。编辑已有配置、手填模型 ID 均为单项操作。批量提交使用各自的模型 ID 作名称，连接参数共用，与单项连接测试分别操作。
