# 连接设置卡片网格验收

- 验收环境为 Ubuntu 26.04.1、Node 26.13.1、NSH 0.4.0（e626a8d），使用 GTK/X11 和私有 Xvfb。原生截图为 1270 × 790。
- Git 基线为 `e3324505148f078e06725ca8b29470865efc6eb1`，最终源码指纹为 `9834d2dbc6197fa2faf4591eb88ed8b346664bffc47cd4ff7e14eaffbbb6b471`。Bubblewrap 隔离实例为 `c87c06fb36016383`，运行正式 `App.tsx` 和真实 Node sidecar，使用独立的 SQLite 数据和本地模型替身。
- 在隔离网络启动仓库的 Streamable HTTP MCP 测试服务，通过 `nsenter --user --net --preserve-credentials` 监听 `127.0.0.1:23115`。 [测试服务日志](logs/mcp-fixture.jsonl)

## 原生操作与视觉复核

| 操作 | 观察 | 原生截图 |
| --- | --- | --- |
| 账户菜单进入「我的设置 → 连接」 | 执行器首排两张卡同宽同高，列间隔 10 像素。状态点和文字在右上，配置按钮在右下且底边对齐。Codex ACP 落单保持同列的 310 像素宽 | [默认](screenshots/connectors-01-connectors.png) |
| T3 打开、取消、重开，再选择逐次审批并保存 | 编辑卡宽 630 像素。权限和两个凭据字段完整显示，取消和保存按钮右下对齐。保存后卡片回到半宽并回显档位 | [T3 编辑](screenshots/connectors-02-t3-editor.png) · [保存后](screenshots/connectors-03-t3-mode-saved.png) |
| 展开 Bot 自己并改思考等级为「高」 | 卡片占满 630 像素，四项设置与卡片内边缘对齐，左下提示生效时机，右下收起。下行 T3 和 Codex ACP 继续等宽等高 | [Bot 自己展开](screenshots/connectors-04-self.png) |
| 从「暂无连接器」进入添加 | 空卡保留半宽、虚线描边、圆形加号和操作说明。整卡点击打开 MCP 表单 | [空态完整视图](screenshots/connectors-03-t3-mode-saved.png) · [添加表单](screenshots/connectors-05-mcp-editor.png) |
| 添加两个 HTTP MCP | 404 错误后保留表单，改正地址后分别添加。两张卡显示状态、工具数和不同的授权摘要 | [失败](screenshots/mcp-management-01-failed-address.png) · [授权](screenshots/mcp-management-02-grant.png) · [两项在线](screenshots/mcp-management-03-two-services.png) |
| 清空验收甲授权，再断开和重连 | 清空后摘要更新为「未授权」。断开显示「未连接」、原因「已断开」和 0 个工具。重连恢复在线和 1 个工具，保留空授权 | [断开](screenshots/mcp-management-04-disconnected.png) · [重连](screenshots/mcp-management-05-reconnected.png) |
| 用 MCP 场景保存的数据打开隔离窗口并滚动到底 | 两张 MCP 卡状态在右上，管理按钮完整显示且同排对齐。末位添加卡保持 310 像素半宽 | [完整 MCP 网格](screenshots/mcp-grid-scrolled.png) |

逐张打开原生图后按设计条目复核。设置区保持中性色，截图中的正文、标签和字段均可读。660 像素高设置弹窗的右侧内容使用既有滚动区域，首屏底部之外的卡片通过滚动查看。额外 MCP 截图在同一实例命名空间内用 NSH 原生测试滚动取得。 [滚动测试日志](logs/mcp-grid-scroll.log)

首轮原生图发现落单卡片宽 327 像素，上排半宽卡片宽 310 像素。网格改用等宽单元格承载卡片和空位，最终图的落单卡与上排列宽一致。

## 数据核对

对隔离 CLI sidecar 执行两次 `verify api snapshot`，比较前后 `connectors` 和 `settings`，两部分内容一致。原生窗口使用独立数据目录，T3 档位验证来自原生保存后的回显，MCP 的授权、断开和重连来自原生场景及本地测试服务握手。 [操作前](artifacts/api-before.json) · [操作后](artifacts/api-after.json) · [比较](artifacts/snapshot-comparison.json)

## 检查与边界

- `verify ui run connectors --target native` 和 `verify ui run mcp-management --target native` 各通过 1 个正式原生场景。 [连接操作日志](logs/connectors-native.log) · [MCP 操作日志](logs/mcp-management-native.log)
- 桌面回归额外覆盖卡片按顺序分组、落单占位、两个编辑器分别占满一行、换行保留 T3 草稿、关闭设置重置和空卡点击。原有 MCP 拼接文案断言改为分别核对卡片的状态和信息行。
- `pnpm --silent verify check --run c87c06fb36016383` 退出码为 0。返回 `ok: true`，9 项 `status: passed`，Agent 103/103、桌面 91/91、CLI 15/15。最终日志无 unknown class 诊断。 [全量结果](artifacts/full-check.json) · [Agent 日志](logs/agent-test.log) · [桌面日志](logs/ui-test.log) · [CLI 日志](logs/control-test.log)
- 共享工作树更新和依赖重装期间，首轮 Agent 检查有两个入口因模块解析失败退出。依赖恢复后重新加载隔离实例并重跑两套原生场景。首次重跑的命令会话提前退出，最终轮保留完整 JSON 和退出码。 [首轮 Agent 日志](logs/agent-test-before-restart.log)
- `evidence report` 返回 `status: passed`、`visualStatus: passed`、`fresh: true`，收录 11 张场景截图及复核。补充滚动图单独归档。隔离实例已停止，证据文件保留。 [证据报告](artifacts/evidence-report.json) · [停止回执](artifacts/env-stop.json)
- 真实外部 T3 配对、审批、ACP 派活和用户当前桌面窗口未实测。
