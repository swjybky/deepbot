# 设计 Token

> 何时读：写任何颜色、字号、圆角、阴影、间距之前。
> 源文件：[`apps/desktop/theme.json`](../apps/desktop/theme.json)（颜色）、[`apps/desktop/nsh.json`](../apps/desktop/nsh.json) 的 `tailwind`（字号 / 圆角 / 阴影）。

所有视觉值都来自 token。屏幕代码里**不得出现十六进制颜色或魔法字号**；例外只有两类：
Bot 自己的颜色（`bot.color`，来自 [avatar.md](components/avatar.md) 的调色板），以及组件内部已经封装好的插画细节。

## 颜色

Token 在 class 中直接用名字（`bg-card`、`text-muted-foreground`、`border-edge`），可加透明度（`bg-sidebar-accent/60`）；
在 Canvas 等 class 到不了的地方用 `token("name")`（`import { token } from "nsh"`）。

### 表面

| Token | 值 | 用途 |
|---|---|---|
| `background` | `#FBFBFA` | 窗口底色、对话区 |
| `sidebar` | `#F4F4F3` | 左侧栏底色 |
| `card` | `#FFFFFF` | 卡片、弹窗、右侧信息面板、描边按钮、输入框底 |
| `popover` | `#FFFFFF` | 下拉列表弹层 |
| `secondary` | `#F6F6F5` | 次要按钮底色、描边控件 hover |
| `chip` | `#F1F1EF` | 图标底块、输入框内软按钮、行 hover |
| `muted` | `#EFEFED` | Bot 消息气泡、分段 Tab 选中底、进度条轨道 |
| `nav-active` | `#EDEDEB` | 导航项选中、禁用的主按钮底 |
| `sidebar-accent` | `#E8E8E6` | 左侧栏 Bot 行选中 |
| `primary` | `#141414` | 中性主按钮、实心图标按钮；对话气泡按下节使用 Bot 强调色 |
| `overlay` | `rgba(20,20,20,0.28)` | 弹窗遮罩（只由 `Modal` 使用） |

### 文字与图标

| Token | 值 | 用途 |
|---|---|---|
| `foreground` | `#1A1A1A` | 正文、标题、描边按钮的图标 |
| `muted-foreground` | `#6B6B6B` | 说明文字、分组标题、状态、下拉箭头 |
| `faint-foreground` | `#8A8A87` | 占位符、禁用文字、行尾 chevron |
| `icon-foreground` | `#4A4A4A` | 软按钮 / 幽灵按钮 / 导航项里的图标、头像首字母 |
| `primary-foreground` | `#FFFFFF` | `primary` 底上的文字和图标 |

### 线条

| Token | 值 | 用途 |
|---|---|---|
| `edge` | `#E6E6E3` | 控件描边：图标按钮、次要按钮、下拉触发器、Bot 胶囊、链接卡片 |
| `border` | `#ECECEA` | 卡片 / 分组描边、右侧面板左边线 |
| `input` | `#E3E3E0` | 输入框、消息输入条描边；空状态虚线 |
| `divider` | `#F0F0EE` | 弹窗页眉页脚分隔线、设置导航右边线 |
| `sidebar-border` | `#EBEBE9` | 侧栏边界 token；账户区不画上边线，分栏线由 ResizableColumns 统一绘制 |
| `ring` | `#A3A3A0` | 聚焦描边、单选网格的选中圈 |

### 状态

| Token | 值 | 用途 |
|---|---|---|
| `track` | `#D9D9D6` | 开关关闭时的轨道 |
| `online` / `offline` | `#1DB863` / `#B5B5B2` | 在线状态点 |
| `pin` | `#F59E0B` | 置顶 Bot 的星标徽章 |
| `feedback-success` / `feedback-success-bg` | `#18733B` / `#F0FAF3` | 成功提示文字与边框 / 浅底 |
| `feedback-info` / `feedback-info-bg` | `#245EAD` / `#F0F6FF` | 普通信息文字与边框 / 浅底 |
| `feedback-warning` / `feedback-warning-bg` | `#965A08` / `#FFF8E8` | 警告提示文字与边框 / 浅底 |
| `feedback-error` / `feedback-error-bg` | `#B42318` / `#FFF2F0` | 错误提示文字与边框 / 浅底 |

### 强调色

强调色 = **当前打开的 Bot 的颜色**，读取 `accentColor()`（`ui/state/bots.ts`）。**只在对话区使用**，对话中的强调都跟随 Bot 形象的颜色，不另用固定的蓝色等品牌色：

| 用途 | 取色 |
|---|---|
| 用户消息气泡、输入条「发送」按钮、选择卡片已选的字母徽标（底色，上面白字） | `botFill(color)`（`ui/theme/avatar.ts`）：原色压暗约 15%，不够白字对比 4.5 时继续压暗，保持色相 |
| 回复等待动画圆点等不承载文字的点线 | 原色 |

设置窗口、右侧 Bot 信息面板等对话以外的控件不使用 Bot 强调色：开关、主按钮保持中性的 `primary`。Bot 头像仍保留本色；反馈等级、在线状态和停止图标使用各自语义色，不随 Bot 切换。不要把 Bot 强调色用于文字颜色。

### 暗色模式

目前只有浅色设计稿，`nsh.json` 设了 `"appearance": "light"`。加暗色时在 `theme.json` 的 `cssVars.dark` 里补同名 token，
屏幕代码不需要改——这正是禁止写死颜色的原因。

## 字号

| Class | 大小 | 用途 |
|---|---|---|
| `text-caption` | 12 / 行高 1.5 | 行内说明、状态（"已暂停"）、进度说明 |
| `text-meta` | 12.5 / 行高 1.5 | 列表第二行预览（侧栏最后一条消息、链接 URL） |
| `text-label` | 13 / 行高 1.5 | 分组标题、按钮（sm）、下拉触发器、Tab、弹窗内说明 |
| `text-body` | 14 / 行高 1.5 | 正文默认：行标题、按钮（md）、Bot 名 |
| `text-message` | 15 / 行高 1.6 | 对话气泡 |
| `text-title` | 16 / 行高 1.5 | 弹窗标题 |
| `text-heading` | 20 / 行高 1.5 | 面板 / 设置页标题、信息面板里的 Bot 名 |

所有文字 token 必须同时定义字号和行高（`[字号, 行高倍数]`），普通文字至少 1.5 倍，消息为 1.6 倍；单行省略和输入框也使用同一 token。不要用裸 `fontSize` 绕过行高，或通过逐个增加容器 padding 修补文字裁切。

文字布局按 [verify 技能](../skills/verify/SKILL.md)验证：`check run --scope ui` 中的 headless 回归只校验字号和文字投影，其近似文字引擎不处理真实行高。真实行框用 `ui run <场景> --target native` 截图核对。

字重只用三档：`font-medium`（500，胶囊里的名字、置顶 Bot 名、对话消息正文）、`font-semibold`（600，标题、列表里的 Bot 名、账户名）、默认 400。
字体由 `theme.json` 的 `font-sans` 统一指定为 `Noto Sans CJK SC`（Linux 安装 `fonts-noto-cjk`）。这是应用的默认字体，覆盖普通文字、输入框和弹窗；不要单独覆盖成未指定中文区域的系统回退字体。系统在 C / 英文 locale 下可能选到日文字形，例如“复”明显偏窄，不能仅凭字框大小把这种差异判为上下裁切。其它平台仍需核对字体可用性和实际字形；需要随应用分发时，把字体文件放进 `apps/desktop/assets/fonts` 并注册。

`<Text>` **不继承**父 View 的颜色和字号：每个 `<Text>` 都要写自己的字号和颜色 class。

## 圆角

| Class | 值 | 用途 |
|---|---|---|
| `rounded-control` | 8 | 下拉触发器、Tab、图标底块 |
| `rounded-field` | 10 | 输入框、导航项 |
| `rounded-row` | 12 | 侧栏 Bot 行、下拉弹层 |
| `rounded-card` | 14 | 卡片、分组、置顶 Bot 磁贴 |
| `rounded-2xl` | 16 | 链接卡片 |
| `rounded-[18px]` | 18 | 消息气泡 |
| `rounded-dialog` | 18 | 弹窗 |
| `rounded-[24px]` | 24 | 消息输入条，随内容增高时保留单行时的圆角 |
| `rounded-full` | — | 文字/图标按钮、UserAvatar、开关；BotAvatar 保留自身形状，列表行按各自行圆角 |

## 阴影

只有四个浮起层级，其它元素一律无阴影（靠描边区分层次）：

| Class | 用途 |
|---|---|
| `shadow-float` | 顶部 Bot 胶囊 |
| `shadow-composer` | 消息输入条 |
| `shadow-popover` | 下拉弹层、非阻塞顶部提示 |
| `shadow-dialog` | 弹窗 |
| `shadow-thumb` | 开关滑块（组件内部） |

## 间距

Tailwind 默认 4pt 步长（`p-4` = 16）。常用值：

- 卡片 / 分组之间：`gap-2`（面板，8）或 `gap-2.5`（设置，10）
- 行内元素：`gap-2.5`–`gap-3`（10–12）
- 行内边距：紧凑 `px-3.5 py-2.5`（面板），常规 `px-[18px] py-2.5`（设置）
- 页面边距：对话区 `px-6`，设置内容 `px-10 pt-8`，侧栏 `px-4`

设计稿的奇数值（9、13、15、22）用方括号写（`py-[9px]`），不要四舍五入到别的值。
