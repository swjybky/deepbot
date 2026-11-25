# 模型多选与批量添加验证

- 验证于 2026-11-18 01:51 起执行，机器时区为 America/Los_Angeles（PST，UTC−08:00），验证人为 Codex。
- 基线是 `e3324505148f078e06725ca8b29470865efc6eb1`。被测工作树包含已有的未提交改动，以及本轮的多选组件、模型编辑器和分组列表、Agent 协议与模型配置保存逻辑。回归分别写在 `apps/desktop/tests/shell.test.tsx` 和 `packages/agent/tests/models.test.ts`。
- Ubuntu 26.04.1 LTS，Linux 7.0.0-43-generic，NSH 0.4.0（e626a8d），Node v26.13.1。正式 App 和真实 Node sidecar 使用独立数据与工作目录。NSH 原生驱动运行在隔离 Xephyr 的 GTK X11 测试窗口。窗口为 1280×800 pt，截图内容为 1270×790 px，缩放 1，中文字体 Noto Sans CJK SC。
- 基准为需求附件及修改前正式 App 的单选截图。前后使用相同窗口大小、初始数据和本机 Magpie 目录。筛选后和保存状态分别验证对应布局。

## 复现与预期

1. 从账户进入「设置 → 模型 → 添加模型」，选 Magpie 并拉取目录。名称留空时打开模型下拉，搜索并勾选多项。取消勾选即时更新数量，搜索保留已选项。
2. 点「完成」返回表单，点「添加 2 个模型」。两个配置独立显示，各以模型 ID 为名，并使用相同的连接参数。原默认模型保留。
3. 重启 App 和 sidecar，展开提供方确认两项读回。分别测试连接，再勾选两项后取消另一份新增草稿。选择已添加的 Flash 配置驱动测试 Bot 对话。
4. 回归覆盖留空、只填空格、填写名称后恢复单选、手输 ID、编辑单项和连接测试。后端回归覆盖整批保存、错误时不写入、重发去重、密钥脱敏及不同模型分别发起请求。

## 代码检查

| 命令（仓库根目录） | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `pnpm check` | 0 | 通过 | [类型与 Rust](logs/check-verified.log) |
| `node --test packages/agent/tests/models.test.ts` | 0 / 6 项 | 通过 | [模型专题](logs/agent-models.log) |
| `pnpm --filter @deepbot/agent test` | 0 / 72 项 | 通过 | [全量 Agent](logs/agent.log) |
| `nsh test apps/desktop --filter 'model catalog batches'` | 0 / 1 项 | 通过 | [桌面专题](logs/ui-batch.log) |
| `nsh test apps/desktop` | 0 / 82 项 | 通过 | [全量桌面](logs/headless.log) |
| `nsh test apps/desktop/App.tsx --target linux` | 0 / 每次 1 项 | 正式 App 的批量保存、重启、取消和测试 Bot 对话通过 | [批量保存](logs/native-final.log)、[重启与对话](logs/native-restart-final.log) |

已检查日志，未出现 `unknown class`。

## 原生截图与实际对比

| 检查项 | 参照 | 本次原生图片 | 实际查看结果 | 结论 |
| --- | --- | --- | --- | --- |
| 名称和模型目录 | [修改前的原生下拉](screenshots/01-before.png) | [未过滤目录](screenshots/02-catalog.png)、[已勾选两项](screenshots/02-multi-select.png) | 下拉由一列单选长列表改为带搜索和复选框的限高列表。长 ID、搜索文字、两枚勾号和计数均完整。下拉对齐模型触发器，随可用空间在上方或下方展开 | 通过 |
| 批量提交入口 | 修改前单项添加表单 | [待提交](screenshots/03-ready-to-save.png) | 两列表单对齐，按钮显示「添加 2 个模型」，名称和连接字段仍在原表单 | 通过 |
| 保存后提供方分组 | [首轮横排裁切](screenshots/initial/group-horizontal.png) | [保存完成](screenshots/04-saved.png)、[重启读回](screenshots/05-restarted.png) | 两个模型从横排改为纵向排列，各自的名称、API 摘要与操作完整可见 | 通过 |
| Bot 使用已添加的配置 | 测试 Bot 请求固定标记 | [原生对话](screenshots/06-bot-reply.png) | 右侧显示已绑定的 Flash 配置，对话区显示模型回复，与账本一致 | 通过 |

已实际查看表中的原生图。Fixture 用于回归和边界切换，以上原生截图和业务操作均通过正式 App 获取。

## 真实业务与产物

| 操作 | 预期 | 实际结果 | 证据 |
| --- | --- | --- | --- |
| 拉取和批量添加 | 选中两项后一次保存两份配置 | 目录返回 31 项。Flash 和 V4 Pro 分别使用模型 ID 命名，连接参数一致，配置 ID 各自独立，原默认项保留 | [原生日志](logs/native-final.log)、[脱敏摘要](artifacts/acceptance.json) |
| 重启、连接和取消 | 读回全部配置，可分别测试，取消不落盘 | 重启读回两项，两次独立连接测试均显示成功。随后取消另一份多选草稿，配置文件与重启前逐字节相同，文件权限为 0600 | [连接测试经过](logs/native-restart.log)、[重启与取消](logs/native-restart-final.log)、[脱敏摘要](artifacts/acceptance.json) |
| Bot 切换 | 新配置可用于实际对话 | 隔离 Bot 绑定本次添加的 Flash 配置并返回 `MODEL_BATCH_OK`，通过 SQLite 投影复核 | [实际截图](screenshots/06-bot-reply.png)、[脱敏摘要](artifacts/acceptance.json) |

脱敏摘要的 SHA-256 为 `33df608e53676d66d7d9346a3e96bc389f07909b2c3c7e09b1025e4945dd2730`。

## 失败、未验证项与复验

- 首轮类型检查发现滚动组件名称错误，已改用仓库现用的 `Scroll`。[首轮类型日志](logs/check.log)
- 首轮 headless 筛选断言同时命中触发器上的已选模型文本，改用复选框的无障碍标签后通过。[首轮桌面专题](logs/ui-models.log)
- 首轮重启脚本完成两项连接测试后，因提供方弹层和分组同名，选择定位有歧义。修正定位后通过取消、Bot 切换、对话和读回核对。[首轮脚本](logs/native-restart.log)、[最终脚本](logs/native-restart-final.log)
- 用户已有开发窗口及其 sidecar 在本次改动前启动。本轮在独立实例验收，现有用户数据未用于验证。应用和 sidecar 完整重启后可加载本次改动。默认 Wayland 的原生操作本轮未跑。

## 最终结论

类型检查、全量 Agent 与桌面测试通过。隔离 Linux 原生窗口的多选、保存和重启读回通过，两条配置分别通过真实 Magpie 连接测试。对话展示 [搜索并选中两项](screenshots/02-multi-select.png) 与 [重启后两条配置](screenshots/05-restarted.png)。
