# 清理旧验证机制

- **时间** 2026-11-23 01:50 至 02:15，America/Los_Angeles（PST）。
- **目标** 以后只用 [verify 技能](../../../../skills/verify/SKILL.md)验证，清理之前的验证机制。用户确认了三组：旧验证入口文档、绕过 CLI 的手工验证路线、旧产物与实例。`package.json` 的 `check`、`test`、`test:ui` 脚本按用户选择保留。
- **代码** Git 基线 `e332450`，含工作树未提交改动。验证实例 `ee07a985e4e0211d`，源码指纹 `84d8ed45c1cd…`，`fresh: true`。
- **环境** Linux 7.0.0-43-generic，Node 26.13.1，NSH 0.4.0，Xvfb 通过 `DEEPBOT_VERIFY_XVFB` 指定（本机未安装）。
- **总结论** 通过。`evidence report` 返回 `status: passed`。

## 清理内容

| 组 | 处理 |
| --- | --- |
| 旧验证入口文档 | 删除根目录 `VERIFY.md`、`ERROR.md` 和 `test/verification/2026-11-13/`（旧的归档结构检查脚本与报告）。5 份历史报告中指向它们的链接改为 verify 技能或功能地图。历史报告正文中「遵循 VERIFY.md」一类记述保留原样，不改写历史 |
| 绕过 CLI 的手工路线 | 删除 `start.sh --check` 模式及其提示，删除 README 中的 `./start.sh --check`。`design/components/avatar.md` 和 `design/tokens.md` 中直接跑 `nsh test --target linux` 再看 `/tmp` 截图的步骤，改为 verify CLI 命令，并写明 CLI 尚不支持的部分 |
| 旧产物与实例 | 删除已被取代的 `002107-four-layer-workflow` 报告及其索引行，删除 `output/` 和 `apps/desktop/output/` 中 13 张零散验证截图，删除 `/var/tmp/deepbot-control-1000/` 下 20 个已停止的实例 |
| 防止再积累 | CLI 回归中的两个集成测试结束时删除自己的实例目录。跑完 11/11 后实例数为 0 |

## 误删与恢复

`output/` 中除验证截图外，还有设计资料：4 张图标概念图（`deepbot-icon-concepts-01a1cf0d/`）和系统图标交付物（`system-icon-2026-11-16/` 的 2 张 PNG 和提示词）。[系统图标报告](../../../system-icon/2026-11-16/235422-design/report.md)链接到后者。删除时把它们误归入了验证截图。已从 T3 检查点 `refs/t3/orchestration-v2/checkpoints/ZGUwMTY2MDkxMmFmYzE2OWNhYWVjMTMzYTUyOTYwNzY/ordinal/7`（01:33）恢复到原位，7 个文件的 git blob 哈希与检查点一致，报告链接恢复可用。

## 验证

逐条命令和退出码见 [walkthrough.log](logs/walkthrough.log)，全部为 0。

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 浏览器场景与读回 | 通过，后端读回 `default / 验证模型` | [浏览器日志](logs/ui-browser.log) |
| 原生场景 | 通过，三张图实际查看并复核 | [原生日志](logs/ui-native.log)、[复核](artifacts/visual-review.json) |
| `check run --scope all` | 类型检查通过，Agent 80/80，桌面 85/85，无 `unknown class` | [Agent 测试](logs/agent-test.log)、[桌面测试](logs/ui-test.log) |
| CLI 回归 | 11/11 | [CLI 测试](logs/control-test.log) |
| 报告 | `status: passed`，`fresh: true` | [CLI 报告](artifacts/cli-report.json) |
| 链接 | 全仓库没有指向已删路径的链接。剩余 40 处断链在清理前就存在（归档的 before 快照、`error/` 中 2 处、vendor 上游 README） | — |

![保存后的原生界面](screenshots/03-model-saved-native.png)

## 未验证

- `start.sh` 只做了 `bash -n` 语法检查。CLI 不启动正式桌面窗口，删除 `--check` 后的实际启动未验证。
- 历史报告正文中仍有约 15 处文字提到 `VERIFY.md`、`ERROR.md`，这是有意保留的历史记述。
