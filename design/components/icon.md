# 图标 Icon

> 何时读：界面里需要图标。
> 代码：[`Icon.tsx`](../../apps/desktop/ui/components/Icon.tsx)、图标表 [`theme/icons.ts`](../../apps/desktop/ui/theme/icons.ts)

NSH 没有 `<svg>` 元素。图标是 24×24 网格上的 SVG path，由 `Icon` 用 `Canvas` + `Path2D` 原生描线绘制。

```tsx
import { token } from "nsh";
import { Icon } from "../components";

<Icon name="clock" size={16} color={token("muted-foreground")} />
<Icon name="star" size={10} color="#FFFFFF" filled />
```

## 规格

- 线性图标：圆角端点、圆角连接，默认线宽 1.8（24 网格上），描线不填充。
- 停止图标是实心方块，使用 `feedback-error` 红色语义 token；由 `IconButton icon="stop"` 统一填充，外圈保持普通描边按钮样式。
- 尺寸只用这几档：

| 尺寸 | 用在 |
|---|---|
| 18 | outline / solid 图标按钮 |
| 16–17 | ghost / soft 图标按钮、列表行、导航项 |
| 20 | 设置里的行首图标、链接卡片 |
| 12 | 下拉箭头 |
| 10 | 徽章 |

- 颜色只用 token：`foreground`（按钮）、`icon-foreground`（软按钮、导航）、`muted-foreground`（行内、说明）、`faint-foreground`（chevron）。

## 规则

- **图标只能来自 `theme/icons.ts`**。新图标：从设计稿拷 path（必须是 24×24 viewBox 的线性图标），在 `icons` 里加一个语义名（按"是什么"命名：`share`、`lock`，不按"在哪用"命名），然后用 `name` 引用。
- 不在屏幕代码里写 path 字符串，不用 emoji 或文字符号（"▾"、"✕"）代替图标。
- 图标是装饰：可点击的图标一定包在 [IconButton](button.md) 或带 `accessibilityLabel` 的按钮里。
