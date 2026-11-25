# 存量写法清理与规则验证

2026-11-23 18:29–18:39 PST。工作区基于 `e332450`，最终验证实例为 `b1de8dd82cd187ff`，源码摘要为 `97bb26699692aabc1e47b5a7853d1fcb4281717b56b183603b87551a61614bf2`。环境为 Ubuntu 26.04.1、Node 26.13.1、NSH 0.4.0（e626a8d）、独立 Xvfb 和无头 Chromium。真实 sidecar 在 Bubblewrap 中使用独立 SQLite、合成文件和本地模型替身。 [实例与最终源码](artifacts/env-restart.json)

## 清理结果

| 项目 | 清理前 | 清理后 |
| --- | ---: | ---: |
| 项目自有源码和测试的显式 `any` | 49 | 0 |
| `as never` | 16 | 0 |
| TS/JS 检查豁免注释 | 2 | 0 |
| `.lint/source.json` 的逐行或逐文件 `allow` | 4 | 0 |
| 源码规则 | 2 | 18 |

先统一产物授权、协议解码和连接器进程边界，再迁移请求状态、本地存储、记忆和例行写入，去掉废弃的 mock 和 3 个占位设置页。存量复扫归零后，新增 16 条源码规则。规则和回归接入 `verify check`，提交钩子使用同一入口检查暂存区。 [语法扫描](artifacts/source-inventory.json) · [源码规则](../../../../.lint/source.json) · [提交钩子](../../../../.githooks/pre-commit)

## 代码检查

`pnpm --silent verify check --run b1de8dd82cd187ff` 退出码 0，**9/9 通过**。 [全量检查 JSON](artifacts/full-check.json)

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 功能地图、源码规则及规则回归 | 功能地图和 19 条机器规则通过，规则回归 3/3 | [功能地图](logs/map-check.log) · [规则](logs/source-rules.log) · [规则回归](logs/rules-test.log) |
| Agent | 严格类型检查 0 条诊断，离线用例 91/91 | [类型检查](logs/agent-types.log) · [测试](logs/agent-test.log) |
| 桌面 | 严格类型检查 0 条诊断，Clippy 通过，桌面用例 84/84 | [类型检查](logs/ui-types.log) · [Clippy](logs/ui-clippy.log) · [测试](logs/ui-test.log) |
| 验证 CLI | 15/15，包含暂存区隔离、破坏性命令预演和 worker 拦截 | [测试](logs/control-test.log) |

首轮全量检查发现暂存区测试的临时仓库漏复制共享进程探测模块。补齐夹具后重跑通过。产物预览从 Rust 移到 Agent，原有的 UTF-8 和图像识别用例一起迁移。后端新增 40 MiB 文件的流式哈希回归，桌面新增坏协议事件后的继续接收用例。 [首轮 CLI 诊断](logs/initial-control-test.log) · [Agent 回归](logs/agent-test.log)

## 场景与截图

逐张查看或用像素比对确认了 5 张 1270×790 原生图和 2 张 1280×800 浏览器图。原生资料库保留记忆在上的分组顺序，文件单行可点击。预览弹窗的标题、正文、路径、哈希和关闭按钮完整可见。原生模型列表、编辑和保存后的三张图与上轮同场景的 RGB 差异像素数均为 0。 [复核记录](artifacts/visual-review.json) · [像素对比](artifacts/screenshot-comparison.json)

| 操作 | 观察到的结果 | 证据 |
| --- | --- | --- |
| 原生资料库 `ui run library-artifact --target native` | 从公开界面发消息，后台登记隔离工作区中的文件。打开列表项后显示实际正文和 SHA-256 | [列表](screenshots/native-library-artifact-01-artifact-listed.png) · [预览](screenshots/native-library-artifact-02-artifact-preview.png) · [日志](logs/native-library-artifact.log) |
| Chromium 资料库 `ui run library-artifact --target browser` | 可在相同界面操作中读到合成正文。直接调 `artifact.preview` 读回同样内容 | [浏览器预览](screenshots/browser-library-artifact-02-artifact-preview.png) · [接口响应](artifacts/library-file-allowed.json) · [日志](logs/browser-library-artifact.log) |
| 文件权限与预演 | 关闭文件权限后，原产物 ID 的预览返回 `API_REJECTED`；系统打开命令预演返回 `writes: false`。路径越界、符号链接与目录授权撤回另有回归 | [拒绝响应](artifacts/library-file-denied.json) · [系统打开预演](artifacts/library-open-plan.json) · [回归](logs/agent-test.log) |
| 原生模型 `ui run model-settings --target native` | 界面把「默认模型」保存为「验证模型」，同一原生 sidecar 发出的公开快照读回 `default / 验证模型` | [保存截图](screenshots/native-model-settings-03-model-saved.png) · [公开快照](artifacts/native-model-snapshot.json) · [日志](logs/native-model-settings.log) |

## 验证范围

五个 live/smoke 脚本已纳入 Agent 的静态类型检查。运行验证覆盖本地模型和连接器替身、Linux 原生窗口与 Chromium。真实第三方服务、macOS 和 Windows 原生窗口以及实际系统应用打开属于本轮未验证项。

Agent 保留 `skipLibCheck`。本机关闭后复测得 13 条第三方声明诊断，全部位于 Chord 1.5.0 和 Google GenAI 2.21.0。另有 4 条 Rust 豁免位于有版本归属的 GTK vendor 补丁。 [依赖诊断](logs/agent-vendor-types.log)

最终 `evidence report` 为 **`passed`**，源码版本为 **fresh**。截图和日志已归档，实例已停止，合成数据经预演核对后清理。 [证据报告](artifacts/evidence-report.json) · [收尾记录](artifacts/data-delete.json)
