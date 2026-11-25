# Magpie 模型提供方验证

- 时间与时区：2026-11-18 00:53–00:59 PST（America/Los_Angeles，UTC−08:00）。
- 验证人：Codex。
- 目标：在「设置 → 模型 → 添加模型」提供方下拉中选择 Magpie，从本机网关拉取可用模型，可测试、保存并供 Bot 使用。
- 代码：基线 e3324505148f078e06725ca8b29470865efc6eb1。工作树已有未提交改动。本次验证包含模型预设、编辑器、运行时认证、模型配置草稿/保存及相应测试的变更。
- 环境：Ubuntu 26.04.1 LTS，Linux 7.0.0-43-generic，NSH 0.4.0（e626a8d），Node v26.13.1。原生验收在隔离 Xephyr 显示中使用 GTK X11 和 NSH 原生输入驱动。窗口 1280×800 pt，内容截图 1270×790 px，缩放 1，中文字体 Noto Sans CJK SC。
- 数据：独立数据目录和工作区，真实 DeepBot App、Node sidecar、Magpie 0.1.4407 和 deepseek/deepseek-flash。初始配置为本轮占位模型，Bot 使用本轮测试文本。
- 参照：需求附件中的提供方下拉及 [Magpie 网关接入文档](https://usemagpie.ai/docs/integrate)。附件与验收窗口尺寸和滚动位置有差异。新增预设以需求截图作为布局参照。
- 总结论：类型检查、后端测试、headless 和隔离原生端到端流程通过。

## 复现与预期

1. 运行本机 Magpie。进入设置模型页，点「添加模型」，打开提供方下拉。原有项目正常显示，新选项位于「阿里千问 · 百炼」与「其他兼容服务」之间。
2. 选中 Magpie，默认地址为 http://127.0.0.1:3425/v1，API 类型为 OpenAI Chat Completions。留空 API Key，拉取目录、选择模型并测试连接。草稿测试成功后保存。
3. 重开 App 和 sidecar，展开 Magpie 分组确认配置读回。开启第二份 Magpie 草稿后取消，配置数量保持两份。切换测试 Bot 的模型配置，并发送仅要求返回测试标记的消息。
4. 回归覆盖更换提供方时旧密钥隔离、显式密钥和环境变量优先、本机网关无需手填密钥及远程地址不使用本机缺省认证。

## 代码检查

| 命令（仓库根目录） | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| pnpm check | 0 | 通过 | [check-final](logs/check-final.log) |
| node --test packages/agent/tests/models.test.ts | 0 / 5 项 | 通过 | [专题](logs/agent-models.log) |
| pnpm --filter @deepbot/agent test | 0 / 71 项 | 通过 | [后端](logs/agent.log) |
| nsh test apps/desktop --filter 'Magpie preset' | 0 / 1 项 | 通过 | [预设](logs/ui-magpie.log) |
| nsh test apps/desktop | 0 / 81 项 | 通过 | [全量复验](logs/headless-final.log) |
| nsh test apps/desktop/App.tsx --target linux，经标准输入输入交互步骤 | 下拉、连接与保存、重启三次均退出 0 | 通过 | [下拉](logs/native-test.log)、[连接与保存](logs/native-magpie.log)、[重启与 Bot 对话](logs/native-restart-final.log) |

已检查归档日志，未发现 unknown class。首轮 headless 有 1 项布局测试写死提供方数量，新增预设后数据显示 7 项。测试改为根据 Fixture 生成的预设数量检查汇总，再运行全量。[首轮日志](logs/headless.log)

## 原生截图与实际对比

| 检查项与位置 | 参照 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 提供方弹层 | 需求附件中的六项下拉 | [02-provider.png](screenshots/02-provider.png) | Magpie 为倒数第二项，原六项次序保持，七项全部可见。中英文、触发器对齐和弹层边界未见裁切 | 通过 |
| 选中预设 | 两列表单和现有控件 | [03-preset.png](screenshots/03-preset.png) | 提供方、API 类型、地址和 API Key 占位文字完整显示，连接参数区域保留原有铺排 | 通过 |
| 拉取并测试 | 草稿连接成功状态 | [04-connection.png](screenshots/04-connection.png) | 可选模型控件显示网关返回的模型 ID，滚动后操作按钮可见，顶部提示模型已返回响应 | 通过 |
| 保存与重新使用 | 提供方按组展示、Bot 按配置选择 | [05-saved.png](screenshots/05-saved.png)、[06-bot-reply.png](screenshots/06-bot-reply.png) | Magpie 独立成组。重新启动后可展开该分组并绑定测试 Bot，聊天气泡显示实际模型的回复 | 通过 |

已实际打开以上五张原图。使用正式 App 和真实 sidecar 验证，headless Fixture 仅用于界面回归。

## 真实业务与产物

| 操作 | 预期 | 实际结果 | 证据 |
| --- | --- | --- | --- |
| 拉取与测试 | 本机网关返回自己的目录，所选模型接受一次连接请求 | 目录接口返回 31 项。原生界面选择 deepseek/deepseek-flash 后连接成功 | [连接截图](screenshots/04-connection.png)、[脱敏记录](artifacts/acceptance.json) |
| 保存、重启与取消 | 配置持久化，取消新草稿保持原列表 | 模型文件以 0600 保存，重启后显示 Magpie 组，取消后仍为两份配置，初始默认项保持 | [原生日志](logs/native-restart-final.log)、[脱敏记录](artifacts/acceptance.json) |
| Bot 切换 | 保存的模型配置可处理对话 | Bot 绑定 ID 与 Magpie 配置一致，账本记录了 MAGPIE_OK，与原生画面相符 | [对话截图](screenshots/06-bot-reply.png)、[脱敏记录](artifacts/acceptance.json) |

脱敏记录取自本机网关和隔离数据，SHA-256 为 4981712ba42ebd7dd32c27dcaf99db667125d556ed6529cf3a847fcac439ffce。

## 失败、未验证项与复验

- 在隔离 X11 开发宿主初次用 xdotool 点击账户时，账户出现悬停但没有打开设置。后续同一显示环境以 NSH 原生驱动进入真实 App，完成上述流程。输入自动化范围见 [ERR-006](../../../../error/linux-native-input.md)。
- 首次重启脚本的 Magpie 文本定位同时匹配分组和预设，调整为弹层对应选项后通过。[首轮重启日志](logs/native-restart.log)
- 现有用户窗口的 sidecar 启动时间早于改动。本轮用独立进程验收。默认 Wayland 和远程网关在线凭据未做实机测试，远程认证隔离由后端回归覆盖。

## 最终结论

代码检查、原生显示、拉取、在线连接测试、保存、重启、取消及测试 Bot 的真实消息均通过本轮隔离验收。对话展示原生下拉 [02-provider.png](screenshots/02-provider.png) 与连接成功状态 [04-connection.png](screenshots/04-connection.png)。
