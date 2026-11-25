# DeepBot 功能地图

改代码前，先在这里找到受影响的功能，再读它的详情页。详情页统一分五节：

1. 功能说明
2. 用户路径
3. 前后端对应：第一行是机器可读的「覆盖」行
4. 用 verify CLI 怎么驱动
5. 注意事项

驱动命令的用法见[验证技能](../../skills/verify/SKILL.md)。

应用没有登录，也没有页面路由。界面固定三栏：

- 左侧是 Bot 侧栏；
- 中间是对话；
- 右侧是可收起的 Bot 信息栏，分「动态 / 资料库 / 配置」三个标签。

弹窗、设置分区和信息栏标签都由 [state/ui.ts](../../apps/desktop/ui/state/ui.ts) 中的信号控制。前端和 Node 后端之间只走 JSON-lines 协议，命令定义在 [protocol.ts](../../packages/agent/src/protocol.ts) 的 `Command` 里。

| 功能 | 一句话 | CLI 场景 | 详情 |
| --- | --- | --- | --- |
| 创建 Bot | 侧栏「+」，填名字，选形状、颜色、模型 | `create-bot` | [create-bot.md](create-bot.md) |
| 侧栏管理 | 切换、置顶、未读、重命名、复制对话 ID、隐藏、删除、拖拽 | `sidebar-switch`、`sidebar-context`（原生） | [sidebar.md](sidebar.md) |
| 聊天发消息 | 在当前 Bot 的对话里发送，查看回复和运行状态 | `chat-send`、`chat-composer`、`chat-activity`（原生） | [chat.md](chat.md) |
| 提问与审批 | 对话里的决定、批准、规矩确认、T3 提问卡片 | `attention-flow` | [attention.md](attention.md) |
| 动态与事项 | 信息栏「动态」页的事项和事项详情，可停止、改派 | `work-flow` | [work.md](work.md) |
| 资料库 | 长期记忆的增、改、删，产物预览 | `library-memory` | [library.md](library.md) |
| Bot 配置、规矩与例行 | 名字、人设、模型、事项并发上限、文件夹，派活规矩，定时例行 | `bot-concurrency`、`bot-rules`、`bot-routines` | [bot-configuration.md](bot-configuration.md) |
| 模型设置 | 新增、编辑、测试、设默认、删除模型配置 | `model-settings` | [model-settings.md](model-settings.md) |
| 设置 | 通用、电脑（连接文件夹）、权限 | `settings-permissions` | [settings.md](settings.md) |
| 连接 | 执行器设置、MCP 连接与 Bot 授权 | `connectors`、`mcp-management`、`remote-t3`、`remote-t3-lan`（原生） | [connectors.md](connectors.md) |
| 启动、数据与重连 | 正式入口、ready 和快照、数据目录、重连 | 无界面场景，用 `env` 和 `api` 命令 | [runtime.md](runtime.md) |

## 保持同步

`node scripts/check-feature-map.mjs` 会做以下比对，不一致就报错，并列出缺了什么：

- 代码里的界面入口（弹窗 `modal:`、设置分区 `settings:`、信息栏标签 `tab:`、配置弹窗分区 `config:`）和协议命令，与各页「覆盖」行是否一致；
- 页里引用的场景是否都存在，现有场景是否都被引用。

全量命令 `pnpm --silent verify check` 会执行这个检查。新增弹窗、分区、标签、命令或场景后，要更新对应页面的「覆盖」行和 CLI 命令。
