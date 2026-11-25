# DeepBot 设计与前端架构

DeepBot 桌面端的界面约定。本文件保留共同原则、架构与索引；尺寸、交互和验收细则放在 `design/` 对应主题中，按任务加载。

## 使用顺序与规则边界

1. 先明确本次改动的对象、位置和状态，再按下表加载主题；不要只套用组件外观而改变返回、关闭、编辑等操作语义。
2. 用户后续明确修正的要求优先。代码用于核对组件 API 和现状，现有实现不自动成为设计标准。
3. 共用规则在本文件，具体规格只在对应主题维护；重复问题先搜索同类入口，修复共用组件或布局，并同步该主题。
4. 验证和交付遵循 [verify 技能](skills/verify/SKILL.md)：代码检查、原生效果、真实交互分别记录；历史报告不能证明当前窗口已经加载改动。

## 设计基调

- **暖中性色 + 黑**：背景 `#FBFBFA`、侧栏 `#F4F4F3`、主色 `#141414`。强调色是**当前 Bot 的颜色**，在对话区用于用户气泡、发送按钮、选择卡片已选徽标（底色压暗后配白字），等待动画用原色，设置等其它界面保持中性；操作提示另用成功、信息、警告、错误四种语义色，不用于普通装饰。
- **靠描边分层，不靠阴影**：卡片、分组、控件都是 1px 浅描边；只有胶囊、输入条、下拉与提示弹层、弹窗四种浮起元素有阴影。
- **胶囊与大圆角**：文字操作按钮和图标按钮用 `rounded-full`，列表按 [列表约束](design/components/list.md)、账户行按 [侧栏约束](design/sidebar.md#账户行与头像入口) 使用行圆角，卡片 14、弹窗 18。
- **安静的密度**：普通界面以 13–14 号字为主，消息正文 15、500 字重；长文先摘要，详情按需展开。行之间不加分隔线；容易理解的操作不加解释小字。
- **立即生效**：普通偏好改了即生效；模型连接参数用草稿统一保存，取消不改变现用配置。
- **动效交代变化，正文保持稳定**：面板横向进出、拖动跟手、等待状态有连续反馈；不要让长文重排带动整个聊天上下扫动。保持操作即时响应，尊重系统“减少动态效果”，详见 [布局动效](design/layout.md#三栏) 与 [侧栏拖动](design/sidebar.md#跨区拖动)。

## 架构

技术栈：[NSH](https://nsh.dev)（Native Shell）。界面是 TSX，运行在 QuickJS 上，渲染成各平台原生视图；
Rust 原生模块（`apps/desktop/src/`）负责启动 Node 上的 agent sidecar（`packages/agent`），见 [README](README.md)。

```
apps/desktop/
├── App.tsx                 入口：窗口设置（隐藏系统标题栏、1280×800）+ mount(AppShell)
├── nsh.json                应用配置 + Tailwind 扩展（字号 / 圆角 / 阴影 token）
├── theme.json              颜色 token（shadcn cssVars 格式）
├── src/                    Rust 原生模块：Agent sidecar 管理
├── tests/                  nsh test 界面测试（headless）
└── ui/
    ├── AppShell.tsx        三栏布局 + 弹窗挂载点
    ├── theme/              非颜色的设计资产：icons.ts（图标 path）、avatar.ts（头像形状、Bot 调色板）
    ├── components/         设计系统层：Button、IconButton、TextField、SelectField、Switch、
    │                       SegmentedTabs、Modal、Group/ListRow、Pressable、MarkdownText…（从 index.ts 导入）
    ├── features/           业务界面，每个区域一个目录
    │   ├── sidebar/        左侧栏
    │   ├── chat/           对话区：消息气泡、输入条、提问卡片（ChoiceCard）
    │   ├── bot-info/       右侧 Bot 信息面板
    │   ├── settings/       我的设置弹窗（sections/ 每个分类一个文件）
    │   └── create-bot/     创建新 Bot 弹窗
    ├── state/              全局状态（signal）：runtime.ts（后端投影）、bots.ts、ui.ts、preferences.ts、types.ts
    └── services/           外部通信：agent.ts（sidecar 协议 v2、重连与幂等重发）
```

业务界面从 `state/runtime.ts` 读取只读的 Agent 投影并提交协议命令，`services/agent.ts` 管理传输和重连重发。组件依赖方向由源码检查执行。 [.lint/source.json](.lint/source.json)

- Bot 颜色由业务读取 `accentColor()` 后通过属性传给组件（例如 `Button.color`、`ChoiceCard.accent`）。
- `features/chat` 展示消息与提问卡片。事项在 `features/bot-info` 的「动态」里查看和操作。后台工作期间保持消息输入条可用。

## 按需加载约束

| 要做的事 | 读这个 |
|---|---|
| 侧栏 Bot、置顶/隐藏、跨区拖动、账户行悬浮 | [design/sidebar.md](design/sidebar.md) |
| 用到任何颜色、字号、圆角、阴影、间距 | [design/tokens.md](design/tokens.md) |
| 改窗口结构、三栏、标题栏 / 拖动区域、对话区、消息气泡，或决定状态放哪 | [design/layout.md](design/layout.md) |
| 按钮、图标按钮、任何可点击的东西、鼠标指针 | [design/components/button.md](design/components/button.md) |
| 文本输入、消息输入条 | [design/components/input.md](design/components/input.md) |
| 下拉选择（从几个选项选一个） | [design/components/select.md](design/components/select.md) |
| 弹窗、设置窗口、确认 | [design/components/dialog.md](design/components/dialog.md) |
| 操作结果、成功、信息、警告、错误、顶部浮层提示 | [design/components/feedback.md](design/components/feedback.md) |
| 开 / 关设置 | [design/components/switch.md](design/components/switch.md) |
| 视图切换 Tab | [design/components/tabs.md](design/components/tabs.md) |
| 列表、分组、卡片、选择与确认、长文摘要/展开、事项分组、空状态、导航、单选网格 | [design/components/list.md](design/components/list.md) |
| 图标、添加新图标 | [design/components/icon.md](design/components/icon.md) |
| Bot 头像、用户头像、Bot 颜色 | [design/components/avatar.md](design/components/avatar.md) |

## 始终适用的规则

1. 根据操作语义选择已有组件。需要新增共用交互时，在对应设计主题中补规格。
2. **不写死视觉值**：颜色用 token class（`bg-card`、`text-muted-foreground`），Canvas 里用 `token()`；字号用 `text-caption … text-heading`；圆角用 `rounded-control … rounded-dialog`。Bot 颜色是唯一允许的动态颜色。
3. **每个 `<Text>` 都写自己的字号和颜色**，NSH 的文字不从父 View 继承样式。
4. **无可见文字的控件必须有 `accessibilityLabel` / `label`**（图标按钮、开关、下拉、头像按钮）。
5. **选中态用 `selected` 和 `selected:` class**。悬停和按下用 `hover:` 与 `active:`。桌面端核对可点击元素的悬停反馈和手形指针。 [鼠标指针](design/components/button.md#鼠标指针)
6. **动态列表用 `<Each of key>`**，key 是稳定 id。
7. 界面文案用简短中文，省略句号。按钮用动词，标题用名词。
8. 给关键元素加 `testID`。新流程按 [verify 技能](skills/verify/SKILL.md)补 verify 场景或 `apps/desktop/tests/` 界面测试，并更新[功能地图](references/features/README.md)。

## 常见页面决策

| 场景 | 必须保持的效果 | 细则 |
| --- | --- | --- |
| 聊天布局 | 顶部 Bot 胶囊浮在正文上；长回复随可用宽度伸缩，悬停按钮不挤动气泡 | [布局](design/layout.md#对话区) |
| 面板开关与分栏 | 两条分隔线可拖动；面板横向滑入，正文重排保持底部跟随或历史阅读位置 | [三栏](design/layout.md#三栏) |
| 提示 | 先判断是否必要；必要操作结果走顶部四级浮层，不挤占功能区 | [Feedback](design/components/feedback.md) |
| 长文与事项 | 事项列表用单行标题，执行中显示呼吸圆点，「已结束」置底折叠；详情长文支持展开/收起 | [事项与长文](design/components/list.md#长文本摘要与详情) |
| 空状态 | 延续已有条目结构，显示“暂无…”；需要管理时整行可点 | [空状态](design/components/list.md#带管理入口的空状态) |
| 右侧面板操作 | 条目操作图标同行；模块操作用列表末尾管理行或占位输入框加号 | [面板操作](design/components/button.md#右侧-bot-信息面板的操作) |
| 返回、关闭、停止 | 返回用于弹窗内的产物预览，关闭回到一级列表。未结束事项的停止图标在弹窗页眉 | [返回](design/components/button.md#返回导航)、[停止](design/components/button.md#事项停止) |
| 配置编辑 | 卡片及嵌套编辑器撑满可用宽度；普通偏好即时生效，模型连接用草稿保存 | [宽度](design/layout.md#右侧配置区宽度注意事项)、[输入](design/components/input.md#连接参数编辑器) |
| Bot 资料库 | 整行点击在弹窗中预览资料正文、文件与长期记忆，同一弹窗提供记忆编辑和删除 | [资料库](design/components/list.md#bot-资料库与记忆) |
| Bot 规矩和例行 | 规矩从「配置」打开弹窗，例行入口放在「动态」的「即将进行」分组 | [规矩与例行](design/components/list.md#bot-规矩与例行) |
| 侧栏拖动 | 空置顶区平时收起，拖动时展开接收空间；仅有效目标高亮，源块无背景 | [侧栏](design/sidebar.md#跨区拖动) |

## 检查

检查和验收都按 [verify 技能](skills/verify/SKILL.md)执行。`pnpm --silent verify check` 已包含 Rust Clippy、`nsh check` 类型检查和 `nsh test` 界面测试。原生效果用 `verify ui run <场景> --target native` 截图复核。本机试用正式应用时，在仓库根目录运行 `./start.sh`。
