# 模型图片输入验证记录

- Codex 于 2026-11-24 20:29 PST 开始验证。
- 工作区基于 `e332450`。改动覆盖桌面模型设置、模型配置协议和存储、运行时能力解析与图片发送校验。
- Verify 实例为 `882da1325184e1a2`。复现源码指纹为 `ce15393356adfac2a1cd845a4353045ff804a8cbc9c0def15a5f387d9246bd08`，复验指纹为 `d7f312191569829a0a6bbd2587e2a12b376541d24af707a86b66429674ac667d`。
- 原生环境为 Ubuntu 26.04.1 LTS、NSH 0.4.0（e626a8d）及私有 Xvfb / GTK X11，截图为 1270×790。
- Bubblewrap 提供独立网络和数据目录，运行真实 `App.tsx`、Node sidecar 和兼容 OpenAI Chat Completions 的本地测试服务。用 NSH 的 `app.paste` 将合成 PNG 注入原生输入事件。

## 复现与修复

旧配置使用「其他兼容服务」和 `gpt-4o`，未写入 `inputMode`。小菜绑定该配置。粘贴合成 PNG，输入正文并发送，得到「当前 Bot 的模型不支持图片输入」。图片和正文仍在输入框，测试服务收到零个请求。 [原生截图](screenshots/images-before-rejected.png) · [协议事件](logs/images-before-protocol.jsonl) · [HTTP 记录](artifacts/images-before-http.json)

发送入口按 Bot 的 `modelConfigId` 获取注册在 `deepbot:<configId>` 下的模型。原逻辑只查所选提供方的目录，兼容服务没有自己的目录条目时，运行时用 `["text"]` 填充，接着发送校验把它当成已知不支持图片。模型设置也缺少声明输入能力的字段。

新配置可选自动识别、仅文本、文本和图片。自动识别优先查所选提供方，再匹配兼容服务可能沿用的已知模型 ID。旧配置缺少能力字段时按自动处理。手动声明优先于目录，能力未知时提示到设置确认。

## 实际业务

| 操作 | 观察结果 | 证据 |
| --- | --- | --- |
| 用新版重跑原有 `gpt-4o` 配置 | 直接发送并看到 `IMAGE_RECEIVED gpt-4o`，草稿清空，旧配置仍可读 | [原生截图](screenshots/images-verified-known-sent.png) |
| 在 Bot 配置里切换到 `fixture-vision` 后发图 | 提示无法自动识别，合成 PNG 和正文留在输入框 | [原生截图](screenshots/images-verified-unknown-draft.png) |
| 编辑该模型并选「文本和图片」，保存后重发原草稿 | 原草稿进入对话，收到 `IMAGE_RECEIVED fixture-vision` | [下拉选项](screenshots/images-verified-mode-options.png) · [发送结果](screenshots/images-verified-declared-sent.png) |
| 重新启动同一数据目录的隔离原生 App | 自定义模型仍选「文本和图片」，Bot 仍绑定此模型，两条图片历史可见 | [原生截图](screenshots/images-verified-mode-reloaded.png) · [磁盘配置](artifacts/isolated-models-reloaded.json) |
| 在 Bot 配置里切换到目录标注仅文本的 `gpt-4` 后发图 | 明确提示不支持图片，正文和缩略图仍在草稿。没有新增消息或模型请求 | [原生截图](screenshots/images-verified-text-draft.png) · [协议事件](logs/images-verified-protocol.jsonl) |

测试服务共收到两次 `POST /v1/chat/completions`。每次最新用户消息均有一个 `image_url` PNG 块，解码后与 69 字节合成图片逐字节相等。测试服务只在收到正确图片时回复 `IMAGE_RECEIVED`。 [HTTP 接收摘要](artifacts/images-verified-http.json) · [测试服务日志](logs/image-http-events.log) · [原生驱动日志](logs/images-verified-native.log)

## 界面与代码检查

实际打开了修复前截图、修复后业务截图和 `model-settings` 的三张原生截图。设置页保留左侧导航和右侧滚动结构。「输入能力」与「API 类型」等宽对齐。三项下拉文字完整，保存后编辑器收起。重开配置后显示已保存选项。错误提示在主窗口顶部完整换行，正文与待发缩略图仍可见。 [原生场景](artifacts/verify-model-native.json) · [浏览器场景](artifacts/verify-model-browser.json) · [公开快照](artifacts/verify-model-snapshot.json) · [视觉复核](artifacts/verify-visual-review.json)

`pnpm --silent verify check` 退出码为 0，9 组检查全部通过。Agent 99 项、NSH 桌面 89 项、verify CLI 15 项及防错规则 3 项用例全部通过。类型检查、Clippy、功能地图和源码规则通过，NSH 日志未出现 unknown class。独立检查的源码指纹与复验实例一致。 [全量结果](artifacts/verify-check-full.json) · [Agent 日志](logs/full-agent-test.log) · [桌面日志](logs/full-ui-test.log) · [CLI 日志](logs/full-control-test.log)

Verify 场景缺少图片粘贴步骤，`api call` 也未开放 `message.send-images`。图像业务使用同一个 verify 实例的源码副本和隔离挂载做补充原生操作。可为 Verify 场景增加 `paste` 步骤并限制在合成附件，让这类操作复用场景报告。复现阶段调整过 NSH 测试定位器。第一次更新源码时，工作区里并行进行的反馈提示改动触发了 `CHECK_SOURCE_STALE`。随后同一实例重新同步源码并复跑模型设置和图片业务。

关联的 `verify check --run 882da1325184e1a2` 首次命令退出码为 143，等待隔离 worker 完成后重新执行，退出码为 0，9 组检查全部通过。最终 `evidence report` 为 `passed`，视觉复核通过，`failed` 和 `missing` 均为空。隔离实例于 20:39 PST 停止，保留验收数据。 [关联检查](artifacts/verify-check.json) · [最终证据报告](artifacts/verify-evidence-report.json) · [停止状态](artifacts/verify-stopped.json)

## 验收边界

验收覆盖 Linux GTK X11 原生界面、真实 sidecar、本地 HTTP 图片请求和隔离配置重启。实际在线模型推理、系统图片选择器、Wayland 及正式运行窗口的加载情况未实测。
