# T3 Code 密钥配置验证

- 2026-11-18 23:27 起执行，机器时区为 America/Los_Angeles（PST，UTC−08:00），验证人为 Codex。
- Git 基线为 `e3324505148f078e06725ca8b29470865efc6eb1`。被测工作树含已有未提交改动。本轮改动涉及连接器设置和 TextField、协议与 sidecar 运行层、T3 MCP 与配置保存、对应桌面和后端回归。
- Ubuntu 26.04.1 LTS，Linux 7.0.0-43-generic，NSH 0.4.0（e626a8d），Node 26.13.1。正式 DeepBot App 和 Node sidecar 在隔离 Xephyr 中用 GTK X11 输入。窗口 1280×800 pt，原始截图 1270×790 px，缩放 1，中文字体为 Noto Sans CJK SC。
- 使用隔离的 `DEEPBOT_DATA_DIR`、`DEEPBOT_WORKSPACE` 与回环 T3 MCP 测试服务。初始环境变量提供一条会被服务拒绝的测试密钥。对比参照为用户截图和相同隔离数据的修改前原生窗口。

## 复现与预期

1. 从账户打开「设置 → 连接器」。T3 Code 的认证状态显示 HTTP 401，卡片同行提供「配置密钥」。
2. 点击配置。输入按照圆点显示，空白时无法保存。取消后重新打开，输入为空。
3. 填入错误的测试密钥并保存，顶部提示认证失败，保留草稿供修正。改用有效测试密钥后，卡片变为「可用」，立即显示工具数。
4. 关闭并再次启动正式 App 和 sidecar，保留启动环境中的过期密钥，再打开连接器设置。连接仍为可用，重新打开输入框时为空。
5. 后端回归覆盖首次无效、保存请求重放、无效替换后保留原密钥、已存在 Bot 即时查询 T3、重启持久化、配置权限和公开投影脱敏。

## 代码检查

| 命令（仓库根目录） | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `pnpm check` | 0 | 通过 | [类型与 Rust](logs/check.log) |
| `node --test --test-name-pattern='T3 Code credential command\|without a credential\|T3 settings come from the environment first' packages/agent/test/connectors.test.ts packages/agent/tests/runtime.test.ts` | 0 / 3 项 | 通过 | [后端专题](logs/agent-focused.log) |
| `pnpm --filter @deepbot/agent test` | 0 / 73 项 | 通过 | [全量 Agent](logs/agent.log) |
| 独立 Node 首次保存检查 | 0 / 1 项 | 空数据目录首次认证成功后生成配置文件 | [首次保存](logs/empty-config.log) |
| `nsh test apps/desktop --filter 'T3 Code credential'` | 0 / 1 项 | 通过 | [桌面专题](logs/ui-focused.log) |
| `nsh test apps/desktop` | 0 / 83 项 | 通过 | [全量桌面](logs/headless.log) |
| `nsh test apps/desktop/App.tsx --target linux` | 0 / 3 次各 1 项 | 基线、原生配置和重启分别通过 | [基线](logs/native-before.log)、[配置](logs/native.log)、[重启](logs/native-restart.log) |

日志中的 `unknown class` 匹配数为 0。

## 原生截图与实际对比

| 检查项与位置 | 参照或修改前 | 本轮原生结果 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| T3 Code 卡片首行 | [原生基线](screenshots/01-before.png) | [配置入口](screenshots/02-entry.png) | 右侧状态点旁显示「配置密钥」。标题、401 状态和按钮在同一行组内完整可见。卡片宽度和下方 Codex ACP 卡片位置与基线对齐 | 通过 |
| 编辑器和密钥输入 | [配置入口](screenshots/02-entry.png) | [输入后](screenshots/03-masked-editor.png) | 编辑器在卡片内展开。密钥框与卡片左右内边对齐，输入后只显示圆点，标签和两个操作按钮完整可见。展开后下方内容随设置区滚动 | 通过 |
| 错误与重试 | [输入后](screenshots/03-masked-editor.png) | [错误反馈](screenshots/04-rejected.png) | 顶部浮层报告 HTTP 401，输入框和草稿仍在原位，保存按钮恢复可用 | 通过 |
| 生效与重启 | [原生基线](screenshots/01-before.png) | [即时生效](screenshots/05-connected.png)、[重启读回](screenshots/06-restarted.png) | 状态点从灰色变为绿色，状态文字改为「可用」，同一窗口即时显示 3 个工具。重启读回相同状态，点击配置时输入为空 | 通过 |

已实际查看全部原图。前后图片使用同一个原生环境、窗口尺寸和隔离数据。配置操作通过正式 App 与 Node sidecar 执行，T3 认证由回环 MCP 测试服务返回。

## 业务与产物

| 操作或输入 | 预期 | 实际结果 | 后端证据 | 结论 |
| --- | --- | --- | --- | --- |
| 从设置提交 | 错误密钥可修正，有效密钥立即生效 | 原生窗口先收到 401，修正后显示可用。首次错误提交和无效替换均通过后端回归 | [原生配置](logs/native.log)、[后端专题](logs/agent-focused.log) | 通过 |
| 密钥保存和重启 | 仅保存已验证密钥，保留其它连接器，正常重启读回 | 配置文件权限为 0600，除桌面密钥项外配置内容相同。重启时桌面密钥优先于过期环境变量。已确认日志和公开投影无测试密钥 | [脱敏摘要](artifacts/acceptance.json)、[重启](logs/native-restart.log) | 通过 |
| T3 工具更新 | 已存在的 Bot 可即时调用新连接的 T3 工具 | 后端回归在同一个 Bot 会话中通过代码模式查到测试项目，重放同一保存请求时 MCP 只初始化一次 | [后端专题](logs/agent-focused.log) | 通过 |

脱敏摘要 SHA-256 为 `0cead1460041d6444ad4e87c1500a02cb70188166e3f684c539c4dec1cf26f11`。

## 验收范围与待复验项

- 本轮原生交互范围为隔离 X11。用户当前桌面窗口、默认 Wayland 输入和实际 T3 Code 服务待复验。
- 已打开的旧窗口需要重启 App 和 sidecar 加载新协议，再从连接器卡片输入实际密钥。旧窗口协议检查见 [ERR-005](../../../../error/protocol-migration.md)。

## 最终结论

类型检查、73 项后端测试与 83 项桌面测试通过。隔离原生窗口完成 401 复现、密钥配置、重试、即时生效与重启读回。

对话展示 [密钥输入框](screenshots/03-masked-editor.png) 与 [重启读回后的连接状态](screenshots/06-restarted.png)。
