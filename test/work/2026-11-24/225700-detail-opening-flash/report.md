# 事项详情打开时的背景闪烁

- 验证时间为 2026-11-24 22:49–22:57（UTC−08:00），verify 实例为 `7f63d5bf4256ffb7`。Git 基线为 `e3324505148f078e06725ca8b29470865efc6eb1` 加工作树。修复前应用与连接管理验收的源码一致。最终源码指纹为 `7126d1f65e71467222666342e4c805ea054a02b67a4fa280429e879c9e79332f`。[实例重启记录](artifacts/env-restart.json)
- Ubuntu 26.04.1、NSH 0.4.0（e626a8d）、Node 26.13.1、GTK/X11、Cairo、私有 Xvfb、Noto Sans CJK SC。窗口 1280×800，verify 截图为 1270×790。Bubblewrap 中的正式 App.tsx 启动真实 Node sidecar，使用独立 SQLite 和本地合成模型。
- 第一次 verify 场景确认入口和稳定画面。随后用同一实例在私有显示记录修改前后的同一场景。FFmpeg x11grab 以 120 帧/秒采集 1280×800 区域，按各帧 PTS 逐帧对比。场景截图的 250 毫秒等待适用于稳定画面。

## 复现与修复

从小菜的对话发送 `DEEPBOT_VERIFY_WORK`，等真实 sidecar 生成「验证事项」，打开 Bot 胶囊进入「动态」，点击事项卡片。第一次和两次重开都录到透底。事项标题和卡片已出现时，聊天气泡仍从卡片中透出，卡片外的遮罩同时逐渐变深。三个开启过程分别在首个可见弹窗帧后的约 150、150、141 毫秒达到稳定状态。[修复前原生录屏](artifacts/baseline-120fps.mkv) · [像素序列](artifacts/baseline-pixels.txt)

`WorkDetailDialog` 通过共享 `Modal` 传给 NSH `Dialog`。NSH 把遮罩和卡片放在一个原生容器里，GTK 的 `Motion::ModalIn` 淡入该容器的整体透明度。共享组件保留默认 `fade`，仅事项详情传入 `animation="none"`，从同一帧画出完整遮罩和卡片。开关、关闭回调、目标、进度和产物的状态逻辑复用原实现。[事项详情](../../../../apps/desktop/ui/features/bot-info/WorkDetail.tsx#L9) · [共享 Modal](../../../../apps/desktop/ui/components/Modal.tsx#L26) · [GTK 动画](../../../../vendor/nsh-platform-linux/src/navigation.rs#L654)

连接管理继续从 SettingsDialog 使用默认动画。已核对并行改动的验收记录和共享 Modal 的创建、重命名、设置、资料预览及 Bot 配置调用方。[连接管理基线](../../../connectors/2026-11-24/224807-unified-connections/report.md)

## 原生复验

| 操作 | 结果 | 证据 |
| --- | --- | --- |
| 打开、关掉后打开、确认关闭后直接重开 | 三次在首个可见帧直接达到稳定状态。以窗口内像素 (1220, 430) 为例，背景由 RGB (255, 255, 255) 直接变为遮罩下的 (189, 189, 189)，卡片同步完整显示。 | [逐帧对照](screenshots/frame-comparison.png) · [修复后录屏](artifacts/fixed-120fps.mkv) · [像素序列](artifacts/fixed-pixels.txt) |
| 展开目标、点右上角关闭、重开 | 展开控件切换为「收起验证事项」。关闭后仍在原动态页，两次重开恢复默认摘要。 | [场景日志](logs/fixed-native.log) · [关闭](screenshots/fixed-03-closed.png) · [再次打开](screenshots/fixed-05-reopened-again.png) |
| X11 鼠标点击事项、点遮罩关闭、重开、按 Escape 关闭、再次重开 | 三次点击打开均出现详情，遮罩和 Escape 均回到动态列表。 | [原生操作日志](logs/pointer-native.log) · [遮罩关闭](screenshots/pointer-03-backdrop-closed.png) · [Escape 关闭](screenshots/pointer-05-escape-closed.png) · [再次打开](screenshots/pointer-06-reopened-again.png) |

实际看过逐帧图和原生界面。对照弹窗和列表规范，卡片居中、遮罩覆盖窗口、标题和关闭图标的位置一致。详情内的目标、派活对象、进度和产物区可见。[修复前首帧](screenshots/baseline-first-frame.png) · [修复后首帧](screenshots/fixed-first-frame.png) · [修复后详情](screenshots/fixed-02-work-detail.png)

![GTK X11 原生画面逐帧对照](screenshots/frame-comparison.png)

## 检查结果

| 命令 | 退出码与结果 | 证据 |
| --- | --- | --- |
| `pnpm --silent verify ui run work-flow --target native --run 7f63d5bf4256ffb7` | 0，修复前后场景均通过。瞬时透底由原生录屏发现并验证。 | [修复前日志](logs/baseline-native.log) · [修复后结果](artifacts/native-work-flow.json) |
| `pnpm --silent verify ui run connectors --target native --run 7f63d5bf4256ffb7` | 0，原生设置窗打开正常，T3 档位保存及 MCP 授权表单交互通过。 | [设置截图](screenshots/connections-01-connectors.png) · [授权表单](screenshots/connections-06-mcp-access.png) · [日志](logs/native-connectors.log) |
| `pnpm --silent verify check --run 7f63d5bf4256ffb7` | 0，`ok: true`，9 项检查均为 `passed`。Agent 101/101、桌面 90/90、验证 CLI 15/15。 | [结果](artifacts/check.json) · [Agent](logs/agent-test.log) · [桌面](logs/ui-test.log) · [CLI](logs/control-test.log) |
| `pnpm --silent verify evidence report --run 7f63d5bf4256ffb7` | 0，`status: passed`、`visualStatus: passed`，实例与当前源码匹配。 | [报告 JSON](artifacts/evidence-report.json) · [图像复核](artifacts/visual-review.json) |

## 验证范围

帧证据来自隔离 GTK/X11。Wayland 和用户当前运行的正式窗口未验，正式安装未更新。原生场景的派活对象是隔离实例的 Bot 自己，使用合成模型产生待验收事项。实际停止、改派和产物预览使用仓库回归核对。
