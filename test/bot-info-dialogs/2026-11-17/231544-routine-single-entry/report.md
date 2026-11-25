# 例行入口统一到「动态」

- **时间与验证人**　2026-11-17 23:15 起，2026-11-18 00:14 完成，PST（UTC−08:00），Codex
- **代码**　`e3324505148f078e06725ca8b29470865efc6eb1` 工作区，改动集中于 `BotConfiguration.tsx` 的例行入口、已有桌面测试与对应设计规则。
- **环境**　Ubuntu 26.04.1，NSH 0.4.0 (e626a8d)，默认 GTK Wayland。1280×800 原生窗口，右栏宽度分别为 320px 和 240px，系统文字比例 1.0。
- **数据**　布局前后对照使用相同协议 Fixture。正式 App 另以隔离真实 sidecar 预置一已有例行的 Bot 和一个空例行 Bot。
- **结论**　配置卡片移除，例行弹窗可从动态的空态和有数据状态打开。

## 复现与预期

1. 从右栏「配置」查看模型配置到文件夹之间的卡片。保留「规矩」，移除「例行」。
2. 切换到「动态」，点击「即将进行」下的「管理例行」打开当前 Bot 的例行弹窗。关闭弹窗回到动态。
3. 切换空例行 Bot，点击「暂无例行」打开它自己的空态弹窗。既有回归另核对新建、开关和切回原 Bot。

## 检查结果

| 命令或场景 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm check` | 退出 0 | [类型与 Rust](logs/check.log) |
| `nsh test apps/desktop` | 80/80，退出 0 | [全量 headless](logs/headless.log) |
| Linux 原生配置布局专题 | 1/1，320px 和 240px 均无例行入口，规矩和文件夹同栏显示 | [配置](logs/config-native.log) |
| Linux 原生例行专题 | 1/1，空态及有例行的动态入口、新增、开关和 Bot 切换 | [例行](logs/routine-native.log) |
| 正式 App 与隔离真实 sidecar | 1/1，从配置和动态核对入口，打开已有记录和空态弹窗 | [原生交互](logs/real-native.log) |

本轮输出无 `unknown class`。改动前的原生测试截到两种宽度的配置后，在关联文件夹删除步骤等待提交超时。超时发生于截图之后，最终同一用例完整通过。见 [修改前日志](logs/before-native.log)。

## 原生截图对照

| 检查项 | 修改前 | 修改后及观察 |
| --- | --- | --- |
| 320px 配置 | [原图](screenshots/01-before-320.png) | [最终原图](screenshots/02-after-320.png) 中，文件夹移到规矩下方，行间距及右边缘对齐 |
| 240px 配置 | [原图](screenshots/01-before-240.png) | [最终原图](screenshots/02-after-240.png) 中，长模型名仍截断在下拉内，文件夹路径换行，规矩卡片和文件夹连续排列 |
| 真实动态与弹窗 | 保留右侧「即将进行」 | [动态](screenshots/real-activity.png) 保留「管理例行」，实际点击后打开对应 Bot 的 [例行弹窗](screenshots/real-routine.png)。空 Bot 的原生 [Fixture 空态](screenshots/routine-empty.png) 也可打开 |

已实际查看两种宽度的前后原图及最终例行弹窗。对话截图由 [实际 App 配置](screenshots/real-config.png) 和动态的右栏裁切拼接。运行中的开发服务已返回新版 bundle，现有宿主保持连接，用户当前窗口的刷新状态未直接核验。

![配置与动态的最终原生右栏](screenshots/routine-entry.png)
