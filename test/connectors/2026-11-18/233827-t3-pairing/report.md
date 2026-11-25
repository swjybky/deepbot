# T3 Code 配对和原窗口连接验证

- 2026-11-18 23:38 起执行，机器时区为 America/Los_Angeles（PST，UTC−08:00），验证人为 Codex。
- Git 基线为 `e3324505148f078e06725ca8b29470865efc6eb1`，含已有的未提交代码。本轮变更涉及 T3 OAuth 配对与工具投影、连接器设置、通用协议错误反馈及对应回归。
- Ubuntu 26.04.1 LTS，Linux 7.0.0-43-generic，NSH 0.4.0（e626a8d），Node 26.13.1，T3 Code 0.1.11-nightly.20261117.4825。
- 截图来自隔离数据目录的正式 App 与真实 Node sidecar，通过 Xephyr 中的 GTK X11 输入。窗口 1280×800 pt，原图 1270×790 px，缩放 1，Noto Sans CJK SC。原用户窗口另以 Wayland 输入验证，验收日志只记录状态和数量。

## 复现与预期

1. 用户截图里的前端已加载配置表单，后台仍是变更前启动的 Node。该进程返回了「未知的协议命令」。从原窗口重连新版后台后，配置请求进入配对处理。
2. 在「设置 → 连接器 → T3 Code → 配置连接」粘贴 T3 的配对链接或配对码。完整局域网链接指向本机网卡时，从已配置的回环地址完成认证。
3. 普通链接通过 T3 的 MCP OAuth 授权进入需审批模式。带级别的 MCP 码沿用对应级别，已有 MCP 会话密钥可以直接配置。配对码用过或过期时显示重试提示。
4. 连接成功后变为「可用」并显示工具数。重启读回 MCP 会话，再用新的一次性代码完成更换。现有已保存的连接在替换验证失败时仍可用。

T3 授权接口和凭据类型由本机安装版的实现确认，并与 [T3 官方的外部应用接入说明](https://github.com/pingdotgg/t3code/blob/main/docs/user/outside-agents.md) 和 [环境认证说明](https://github.com/pingdotgg/t3code/blob/main/docs/internals/environment-auth.md) 对照。

## 代码检查

| 命令（仓库根目录） | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `pnpm check` | 0 | 通过 | [类型和 Rust](logs/check.log) |
| T3 配对及连接设置后端专题 | 0 / 2 项 | 通过 | [专题](logs/agent-pairing.log) |
| `pnpm --filter @deepbot/agent test` | 0 / 74 项 | 通过 | [全部后端](logs/agent.log) |
| `nsh test apps/desktop --filter 'T3 Code pairing link'` | 0 / 1 项 | 通过 | [桌面专题](logs/ui-pairing.log) |
| `nsh test apps/desktop` | 0 / 83 项 | 通过 | [全部桌面](logs/headless.log) |
| `nsh test apps/desktop/App.tsx --target linux` | 0 / 3 次各 1 项 | 基线、配对、重启及仅复制代码通过 | [基线](logs/native-before.log)、[配对](logs/native-pairing-verified.log)、[重启](logs/native-restart.log) |

测试日志中的 `unknown class` 匹配数为 0。

## 原生截图与实际对比

| 位置或状态 | 修改前 | 本轮原生结果 | 实际查看结果 | 结论 |
| --- | --- | --- | --- | --- |
| T3 配对输入 | [链接直接提交返回 401](screenshots/01-before.png) | [配对输入框](screenshots/02-pairing-editor.png) | 编辑器仍在卡片内。新标签明确接受链接、配对码和 MCP 密钥，中文和英文完整可见 | 通过 |
| 无效配对码 | [基线错误](screenshots/01-before.png) | [配对错误](screenshots/03-invalid.png) | 浮层指明配对码失效或权限不足，遮蔽输入依然保留，修正后可重新提交 | 通过 |
| 局域网链接成功及重启 | [基线不可用](screenshots/01-before.png) | [连接成功](screenshots/04-paired.png)、[重启读回](screenshots/05-restarted.png) | 点击保存后出现成功反馈，T3 Code 变为绿色「可用」并显示 47 个工具。重启后显示相同连接状态 | 通过 |

已实际查看表中的五张原图。前后使用相同的隔离数据、窗口和显示环境。原窗口交互由 Wayland 界面和账本投影验证。

## 真实业务与产物

| 操作 | 预期 | 实际结果 | 证据 | 结论 |
| --- | --- | --- | --- | --- |
| 局域网链接与仅复制代码 | 通过 T3 OAuth 换取 MCP 会话 | 隔离的安装版 T3 经同机局域网链接和原始码分别授权成功。项目查询通过 | [真实 T3 探测](logs/real-t3-mcp.log)、[原生结果](artifacts/native-result.json) | 通过 |
| 刷新原窗口后台 | 原窗口使用支持配对的新后台 | 确认空闲后退出旧 Node，原 Wayland 窗口点击「重连」。提交无效码进入新处理器，得到相应错误提示 | [后台重连](logs/live-window.log)、[原窗口配对](logs/live-window-verified.log) | 通过 |
| 原窗口连接实际 T3 | 原窗口可用，实际项目可查询 | 用本机 T3 签发的新配对码完成配置，47 个工具可发现。项目列表调用成功。配置权限为 0600，配对前后 Bot、消息与事项数量一致 | [原窗口脱敏结果](artifacts/live-window.json)、[实际查询](logs/live-query.log) | 通过 |

## 验收边界

- 原窗口实测范围覆盖配对、连接和只读查询。派活能力按服务返回的工具目录展示。
- 原生脚本首轮用标签定位按钮失败，改用该按钮的 testID 后通过。原窗口的密码输入以分组节点呈现，辅助功能不报告输入框焦点。改用原窗口的无效码提交验证输入路径，再完成授权。相关过程见 [原生首轮](logs/native-pairing.log) 和 [原窗口首轮](logs/live-window.log)。
- 已确认旧后台的错误来源和当前重连结果。协议更新约束见 [ERR-005](../../../../error/protocol-migration.md)。

## 最终结论

类型检查、74 项后端测试、83 项桌面测试通过。隔离 X11 正式 App 配对、失败重试和重启读回通过。原 Wayland 窗口已连通实际 T3 Code，查询真实项目列表通过。

对话展示 [配对输入框](screenshots/02-pairing-editor.png) 与 [连接成功](screenshots/04-paired.png)。
