# 防复发手段优先级与目录边界验证

2026-11-23 19:58–20:04 PST。实例为 `8235415e99778b19`，源码摘要为 `6422a360df7d5f3cfb6b1c587126e7a5ded579d0fc8ae6e008584597334ac2fb`。验证使用 Ubuntu 26.04.1、Node 26.13.1、NSH 0.4.0（e626a8d）、独立 Xvfb 和无头 Chrome。Agent 在 Bubblewrap 内连接本地模型替身，使用独立的 SQLite 和合成对话。 [实例记录](artifacts/env-start.json)

## 选用的约束

| 问题 | 选用的手段 | 验证 |
| --- | --- | --- |
| 界面能拿到写入后端投影的 signal | **设计和类型**。状态模块独占写入入口，界面读取递归只读快照，所有写操作通过共享类型定义的 `command()` | 编译拦住直接替换快照、追加消息、修改嵌套权限、伪造连接状态和导入事件写入口。 [探针](artifacts/read-only-probe.txt) · [诊断](logs/read-only-probe.log) |
| 重连时可能从被改过的对象重新生成请求 | **设计**。待确认队列保存初次提交的 JSON 行，每次重发同一份消息 | 原有断线重连和同一请求 ID 重放回归通过。 [桌面用例](logs/ui-test.log) |
| Agent 运行时直接接触 SQLite 驱动 | **设计和目录规则**。由 `storage/session.ts` 打开数据库，对上提供持久会话存储接口；领域模块通过 Agent 运行时操作账本 | 正反例检查存储层的合法导入、运行时的驱动导入和 Bot 绕过账本的导入。重启实测读回原消息。 [数据访问](../../../../packages/agent/src/storage/session.ts) · [规则用例](logs/rules-test.log) |
| 界面可以绕过协议直接发请求，功能目录可以交叉引用 | **目录与源码规则**。限制原始网络调用、跨功能依赖、共享组件的反向依赖，以及已有封装的底层组件 | 正反例涵盖 `fetch`、WebSocket、网络模块、跨目录转出、底层开关和合法的系统确认框。 [规则](../../../../.lint/source.json) · [规则用例](logs/rules-test.log) |
| NSH 组件初始化时解构 props | **源码规则**。检查参数绑定和组件体内的解构，事件回调可在执行时取当前值 | 正反例分别覆盖组件参数、组件体内初始化、事件回调。 [规则用例](logs/rules-test.log) |

## 文字规则复核

| 原有文字要求 | 处理 |
| --- | --- |
| 阅读入口、明确范围、假设和验收目标 | 根文件保留任务入口与需要人决定的验收口径 |
| 复用组件和共同逻辑 | 导入方向交给规则。是否应该抽取共享能力由实现时判断 |
| UI 使用组件和已有 token | 组件边界及未知 class 交给检查。布局、字号、颜色和具体截断场景由对应设计主题说明 |
| 协议修改逐处检查 Rust、TSX 和 Node | 共享类型、入口解码与重连测试承担可自动验的部分。根文件保留旧数据迁移和重连语义的判断 |
| 能自动复现的缺陷补回归 | 修复流程已记录这项要求，根文件删除重复条款 |
| NSH API 以生成类型为准 | 桌面严格类型检查使用生成声明，根文件删除重复说明 |
| NSH props 解构和界面样式 | props 初始化由源码规则检查。选择字号、颜色与何时截断仍在设计规范里 |
| 原生截图和未验证项 | 按验证技能实际看图并记录范围，视觉和交互结果由人复核 |

精简后的入口继续链接路由、功能地图和验证流程。新增 5 条源码规则，收紧原有的数据库驱动边界。当前全量检查运行 23 条源码规则和 1 条日志规则，提交钩子通过同一入口检查暂存区。 [根指引](../../../../AGENTS.md) · [设计规范](../../../../DESIGN.md) · [钩子](../../../../.githooks/pre-commit)

## 检查与真实入口

`pnpm --silent verify check --run 8235415e99778b19` **9/9 通过**。Agent 91/91、桌面 84/84、CLI 15/15、规则回归 3/3。前后端严格类型检查均为 0 条诊断。 [全量 JSON](artifacts/full-check.json) · [规则日志](logs/source-rules.log) · [桌面日志](logs/ui-test.log)

| 操作 | 实际结果 | 证据 |
| --- | --- | --- |
| 无头 Chrome 和 Linux 原生发送消息 | 输入「你好，验证一下」，收到本地替身回执，发送后输入栏清空 | [浏览器](screenshots/browser-chat-send-02-replied.png) · [原生](screenshots/native-chat-send-02-replied.png) |
| 全量重启后读回 SQLite 数据 | 后端代次改变，两条消息的 ID 和内容在重启后的公开快照中仍一致 | [重启记录](artifacts/env-restart.json) · [重启前快照](artifacts/snapshot-before-restart.json) · [重启后快照](artifacts/snapshot-after-restart.json) |
| 原生模型配置保存 | 保存为「验证模型」，从该原生实例的公开快照读回相同名称 | [保存截图](screenshots/native-model-settings-03-model-saved.png) · [模型快照](artifacts/native-model-snapshot.json) |

实际查看 5 张原生图和 2 张浏览器图。聊天输入、聊天回执、模型列表、模型编辑和模型保存的 5 张原生图均为 1270×790，与上轮同场景的差异像素数都是 0。真实厂商模型、真实连接器和其他操作系统不在本轮隔离运行范围内。 [像素对比](artifacts/screenshot-comparison.json) · [视觉复核](artifacts/visual-review.json)

最终 `evidence report` 为 **`passed`**，与当前源码匹配。验证实例已停止，测试数据经预演核对后清理。 [证据报告](artifacts/evidence-report.json) · [清理结果](artifacts/data-delete.json)
