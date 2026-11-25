# 输入框 TextField / 消息输入条

> 何时读：需要用户输入文字。
> 代码：[`TextField.tsx`](../../apps/desktop/ui/components/TextField.tsx)、[`Composer.tsx`](../../apps/desktop/ui/features/chat/Composer.tsx)

## TextField：表单输入框

```tsx
import { TextField } from "../components";

const name = signal("");
<TextField
  value={name()}
  onChange={(v) => name.set(v)}
  onSubmit={submit}
  placeholder="给你的 Bot 起个名字"
  accessibilityLabel="Bot 名字"
  align="center"
  maxLength={24}
  autoFocus
/>
```

规格：高 40，`rounded-field`（10），`border-input`，`bg-card`，`px-3`，14 号字；占位符 `faint-foreground`；聚焦时描边变 `ring`。宽度撑满父级。

规则：

- **受控**：始终传 `value` + `onChange`，状态放在组件内的 `signal()` 或 state 模块里。
- `accessibilityLabel` 必填。设计稿的输入框没有可见标签，靠占位符说明——占位符写"做什么"（"给你的 Bot 起个名字"），不写"请输入"。
- `align="center"` 只用于弹窗里插画下方的单个名字类输入；表单默认左对齐。
- 回车提交用 `onSubmit`，校验不通过时提交按钮 `disabled`，不要弹错误提示。
- 有长度上限就设 `maxLength`（名字 24）。
- 输入规则通过标签、必要的占位符和禁用态表达，不在字段下方新增操作提示小字。提交、连接或保存失败需要解释时走 [Feedback](feedback.md)，保留草稿并允许修正后重试。

## 消息输入条

对话区底部专用，不要在别处复用这个样式。

- 输入条至少高 48，沿用单行时的 24pt 圆角，`border-input`、`bg-card`、`shadow-composer`、`px-2 gap-2.5`，`max-w-[760px]` 居中，外边距 `px-6 pt-2 pb-5`。
- 纯文本时，`MessageInput` 与两侧按钮同排。加号「添加附件」用 `IconButton soft`，「发送」用 `Button primary size="sm"`，底色取当前 Bot 的 `botFill`、白字。两侧按钮在输入条底部对齐，文字增行时位置稳定。
- 附图时，缩略图在同一个圆角输入框内排在正文上方。缩略图为 56pt，保持原图比例，窄栏可换行，右上角可移除。正文占满可用宽度并可换行，加号和发送键分列底部两端。移除最后一张图后回到纯文本布局。图片草稿与文字草稿一样按 Bot 保存，发送确认且气泡出图后清空，发送失败走统一反馈并保留草稿。
- 当前附件支持 PNG、JPEG、WebP。收到其他格式的文件时走 [Feedback](feedback.md) 显示支持格式。
- 占位符是 `给 {Bot 名} 发消息`。
- `multiline` 和 `submitBehavior="submit"`：回车发送且保持焦点，Shift+Enter 插入换行。发送逻辑在 `Composer` 中完成。

## 真实对话输入

裸输入封装为 `components/MessageInput`，使用 `text-message` token。输入条右侧为发送按钮；后台运行时保持可发送。引用内容显示在输入条上方的描边卡片中，可取消。草稿按 Bot 保留，发送请求使用稳定 requestId，重连重试不生成新消息。

`MessageInput` 按实际可用宽度自动折行，NSH 以排版后的内容测量高度。文字区含上下内边距高 40–160pt。超出上限时在编辑器内纵向滚动，最多显示约六行。删减文字、清空或发送后按剩余内容回缩。自动折行只影响显示，手动换行随正文发送。

`AutoField` 用于已有设置的即时编辑：显示标签，离开输入框或回车时提交有效改动，不增加保存按钮。创建类表单仍由明确的添加操作提交。

模型 API Key 使用 `TextField masked`，已有密钥仅展示配置状态，不回填；留空保留原值，随连接参数草稿统一保存，不套用 `AutoField` 的失焦提交。

## 连接参数编辑器

`FormField` 提供 12 号弱色标签和控件，`FormRow` 将两个字段等宽排列，列间距 12；地址、密钥等长内容独占一行。输入仍使用 `TextField`，不在业务页直接使用原生 Input。

模型连接配置使用独立草稿，点击添加/保存后一次生效，取消丢弃草稿；避免逐字段提交半成品连接信息。API Key 使用 masked 输入，留空保存时保留已有值，不回填已保存密钥。其它普通偏好仍即时生效。

T3 Code 在同一个参数编辑器配置新派工权限、派活和审批连接。两个凭据字段均遮蔽，留空保存沿用已有凭据。连接器卡显示新派工档位、T3 已授权的档位差异及审批连接状态。

添加或管理远端 T3 Code 时，输入 HTTP 地址会在保存按钮前显示明文传输说明，并说明审批连接的 HTTPS 或本机回环要求。

T3 Code 的「配置连接」在连接器卡片内展开 masked 输入框，接受配对链接、配对码和 MCP 密钥。每次展开时显示空白输入。填写后可点「保存并连接」或按回车，验证成功后收起编辑器并更新连接状态。连接失败时保留草稿，操作结果走统一反馈浮层。取消时丢弃草稿。

编辑器外框与 `FormRow` 必须撑满父级可用宽度；两列等分剩余空间，不让名称、模型 ID 或服务地址的内容长度决定整张卡片宽度。列表中编辑已有模型与独立新增表单都要检查右边缘。

## 验收

- 新增、编辑、取消、保存逐项核对：普通字段即时生效；模型连接字段只在保存后生效，取消不改变现用配置。
- 弹出提示、折叠提供方时草稿不丢失；空密钥不覆盖已有值，证据中不显示密钥。
- 用中文输入、占位符和再次清空检查笔画、光标及垂直居中；窄栏和嵌套编辑状态检查右边缘。字体问题按 [文字约束](../tokens.md#字号) 定位，不能用加 padding 掩盖。
- 在原生窗口检查长文本软换行、Shift+Enter、达到上限后滚动、清空回缩。切换 Bot 后草稿按原文恢复。带图片和引用时核对缩略图分行、按钮位置和选文件。
