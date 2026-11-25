# 全量检查与 Git 提交钩子

2026-11-23 PST 在工作区 `e332450` 上验证。原生场景使用 Bubblewrap、私有 X11 显示、NSH GTK 和独立 SQLite。真实 Node sidecar 连接本地模型替身，使用合成数据。

## 严格类型检查

| 检查范围 | 开启严格选项后的首次诊断 | 修复后 | 日志 |
| --- | ---: | ---: | --- |
| 桌面 TypeScript | 78 条，76 处源码或测试位置 | 0 | [首次诊断](logs/desktop-strict-before.log) · [修复后](logs/ui-types.log) |
| Agent TypeScript | 30 条，30 处源码或测试位置 | 0 | [首次诊断](logs/agent-strict-before.log) · [修复后](logs/agent-types.log) |

两端新增索引边界、可选字段、覆盖方法、分支返回和副作用导入检查。Agent 保留 `skipLibCheck`，单独关闭时会在 `@earendil-works/chord` 和 `@google/genai` 声明中产生 13 条诊断。[依赖声明诊断](logs/agent-vendor-types.log)

## 统一命令

`pnpm --silent verify check` 的工作区快照检查通过 9 项，包含功能地图、规则校验及其 2 个回归用例、Rust Clippy、两端类型检查、81 个 Agent 用例、85 个桌面用例和 15 个 CLI 用例。第一次故障演练中，类型检查和 Clippy 报错后仍执行了后续测试，退出码为非零。[失败时的 JSON](artifacts/full-before.json) · [通过时的 JSON](artifacts/full-after.json)

## 提交前检查

主仓库本地 `core.hooksPath` 已设为 `.githooks`。钩子调用同一 CLI 的 `check --staged` 路径，使用暂存区源码与已安装依赖。以下 Git 提交操作均在临时仓库完成。[钩子配置](logs/hook-config.log)

| 暂存内容 | Git 结果 | JSON |
| --- | --- | --- |
| 类型正确 | 退出码 0，9 项通过，生成提交对象 | [放行](artifacts/hook-pass.json) |
| Agent 源码暂存一条 `TS2322`，工作区已将值改正确 | 退出码 1，`agent-types` 失败，其余 8 项通过，提交被阻止 | [阻断](artifacts/hook-block.json) · [诊断](logs/hook-block-agent-types.log) |

首次演练的临时仓库通过软链接共用依赖，本机 pnpm 包装器将 89 个依赖链接重指向临时路径。已恢复原项目中的相对链接并扫描确认无残留。第二轮改用独立依赖副本，钩子直接调用 Node CLI，两项演练均取得预期结果。

## 原生场景

逐张打开 7 张 1270×790 原生截图，参照功能地图第二到四轮的同场景截图。RGB 像素对比的差异像素数均为 0。[对比结果](artifacts/screenshot-comparison.json) · [视觉复核](artifacts/visual-review.json)

| 场景 | 实际观察 | 证据 |
| --- | --- | --- |
| 创建 Bot | 蓝色六角形头像与色板选中描边正常，创建后侧栏和顶部标题显示同一个新 Bot | [选择头像](screenshots/native-create-bot-01-create-dialog.png) · [创建后](screenshots/native-create-bot-02-bot-created.png) · [运行日志](logs/native-create-bot.log) |
| 聊天发消息 | 输入后发送按钮点亮，发送后清空输入并显示本地模型回执 | [输入](screenshots/native-chat-send-01-typed.png) · [回执](screenshots/native-chat-send-02-replied.png) · [运行日志](logs/native-chat-send.log) |
| 模型设置 | 模型列表和编辑表单布局与基准一致，保存后的名称在界面和隔离配置文件中均为「验证模型」 | [编辑](screenshots/native-model-settings-02-model-editor.png) · [保存](screenshots/native-model-settings-03-model-saved.png) · [运行日志](logs/native-model-settings.log) |

第一次隔离重启遇到连接重置，确认实例已停止后重试成功。[重启记录](artifacts/native-restart.json) · [重试结果](artifacts/native-restart-retry.json)

关联截图的全量检查在汇总写入前曾中断。补跑后，同一实例的 9 项检查和视觉复核均通过，报告状态为 `passed`。报告与全量检查记录的源码指纹一致，实例已停止。[关联检查 JSON](artifacts/full-associated.json) · [验收报告 JSON](artifacts/evidence-report.json) · [实例最终状态](artifacts/env-final-status.json)
