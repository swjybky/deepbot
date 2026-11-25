# Bot 配置、规矩与例行

## 1. 功能说明

在右侧信息栏的「配置」页，可以改当前 Bot 的这些内容：

- 名字
- 人设与工作要求
- 模型配置
- 事项并发上限
- 关联文件夹

配置页还有两个弹窗：

- **「规矩」弹窗**：按关键词、目录或动作类别，决定事项派给谁（Bot 自己或某个连接器），以及派工前要不要先问你。
- **「例行」弹窗**：到点让 Bot 自动做一件事，可以只做一次，也可以按间隔重复。

## 2. 用户路径

1. 点中间头部的 Bot 胶囊（`id:bot-pill`），打开右侧信息栏，再点「配置」标签（`text:配置`，`infoTab = "configuration"`）。
2. **名字和人设**：直接改输入框（`id:bot-config-name`、`id:bot-config-instructions`）。按回车或让输入框失去焦点时才保存，没有保存按钮。
3. **模型**：在「模型配置」下拉框（`id:bot-config-model`）里选，选中就立即生效。
4. **事项并发上限**：在 `id:bot-config-max-concurrent` 输入正整数，按回车或移开焦点保存。新建和未设置的 Bot 默认 10。
5. **文件夹**：在「关联一个绝对路径」输入框（`id:bot-folder-input`）填路径，点「+」（`id:bot-folder-add`）添加。每行的垃圾桶按钮用来移除。
6. **规矩**：点「规矩」（`id:bot-config-rules`），弹出「<名字> · 规矩」窗口（`modal = "botConfiguration"`，`section = "rules"`）。
   - 已有规矩各有三个控件：启用开关、派活对象下拉框、「每次派工先问我」开关。
   - 添加规矩：填关键词（逗号分隔，`id:rule-keywords`），或填目录、动作类别，然后选派活对象，点「+」（`id:rule-add`）。
7. **例行**：在「动态」页点「暂无例行」（`id:routines-empty`）或「管理例行」（`id:routines-manage`），弹出「<名字> · 例行」窗口（`section = "routines"`）。
   - 依次选「重复」、填「等待时间（分钟）」（`id:routine-minutes`）、名称（`id:routine-name`）和任务（`id:routine-prompt`），点「+」（`id:routine-add`）。
   - 已有例行可以暂停或启用，也可以改名称、任务和下次运行时间。时间填写本机时区的 `YYYY-MM-DD HH:mm:ss`，按回车或失焦提交。

## 3. 前后端对应

- **覆盖** 界面 `tab:configuration`、`modal:botConfiguration`、`config:rules`、`config:routines`；接口 `rule.upsert`、`routine.upsert`

| 层 | 位置 |
| --- | --- |
| 配置页 | [BotConfiguration.tsx](../../apps/desktop/ui/features/bot-info/BotConfiguration.tsx)：`BotConfiguration()` 是配置页，`BotConfigurationDialog()` 是规矩和例行的弹窗，testID 为 `bot-configuration-dialog`、`bot-config-rules-editor`、`bot-config-routines-editor`。字段用 [AutoField](../../apps/desktop/ui/components/AutoField.tsx)，在回车或失焦时提交 |
| 规矩 | [RuleConfiguration.tsx](../../apps/desktop/ui/features/bot-info/RuleConfiguration.tsx)。派活对象的选项来自 [state/runtime.ts](../../apps/desktop/ui/state/runtime.ts) 的 `assigneeOptions`：Bot 自己，加上所有能派活的连接器 |
| 例行 | [RoutineConfiguration.tsx](../../apps/desktop/ui/features/bot-info/RoutineConfiguration.tsx)。动态页的入口见 [BotInfoPanel.tsx](../../apps/desktop/ui/features/bot-info/BotInfoPanel.tsx) |
| 后端接口 | 配置项用 `bot.upsert` 更新，规矩用 `rule.upsert`，例行用 `routine.upsert`。处理逻辑在 [runtime/app.ts](../../packages/agent/src/runtime/app.ts) |
| 数据 | 都存在 `deepbot.ledger` 文档里，Bot 设置包含 `data.bots[].maxConcurrent`，例行触发后会写入 `lastRunAt` |
| 快照字段 | `snapshot.bots`、`snapshot.rules`、`snapshot.routines`、`snapshot.sharedFolder` |

## 4. 用 verify CLI 怎么驱动

```bash
R=$(pnpm --silent verify env start | node -pe 'JSON.parse(require("fs").readFileSync(0)).runId')

# 原生界面：验证两个 Bot 的默认值、输入校验和独立保存
pnpm --silent verify ui run bot-concurrency --target native --run "$R"

# 界面：用回车改名字和人设 → 添加规矩 → 验证焦点回到关键词框
pnpm --silent verify ui run bot-rules --run "$R"
pnpm --silent verify ui run bot-rules --target native --run "$R"

# 界面：添加每 60 分钟执行的例行 → 验证焦点 → 校验并修改下次运行时间
pnpm --silent verify ui run bot-routines --run "$R"
pnpm --silent verify ui run bot-routines --target native --run "$R"

# 只走后端：改人设（必须带 name），加一条规矩，加一条 5 秒后触发的一次性例行
printf '%s' '{"bot":{"id":"xiaocai","name":"小菜","instructions":"回答尽量简短"}}' | pnpm --silent verify api call bot.upsert --run "$R"
printf '%s' '{"rule":{"id":"rule-verify","botId":"xiaocai","name":"周报","match":{"keywords":["周报"]},"assignee":"self","askFirst":false,"enabled":true,"confirmed":true}}' |
  pnpm --silent verify api call rule.upsert --run "$R"
node -e 'console.log(JSON.stringify({routine:{id:"routine-verify",botId:"xiaocai",name:"验证例行",prompt:"报个到",enabled:true,nextRunAt:Date.now()+5000}}))' |
  pnpm --silent verify api call routine.upsert --run "$R"

# 读回：规矩、例行（触发后 enabled 变为 false，带 lastRunAt），以及例行触发后 Bot 的回复
pnpm --silent verify api snapshot --run "$R" | node -pe '
  const s = JSON.parse(require("fs").readFileSync(0)).result.event.snapshot;
  JSON.stringify({ rules: s.rules, routines: s.routines, last: s.messages.filter(m => m.threadId === "dm:xiaocai").slice(-1) })'

pnpm --silent verify env stop --run "$R"   # 用完停止实例。不再需要数据时，按验证技能「收尾」一步删除
```

场景文件是 [bot-rules.json](../../tools/control/scenarios/bot-rules.json)（截图 `01-configuration`、`02-rule-added`）和 [bot-routines.json](../../tools/control/scenarios/bot-routines.json)（截图包括焦点回到等待时间、编辑后的弹窗和动态列表）。

## 5. 注意事项

- **名字和人设在回车或失焦时保存。** `bot-rules` 用 `submit` 步骤验证回车保存。
- **`bot.upsert`** 每次须带 `id` 和 `name`，已有 Bot 的其他字段可按需提交。
- **事项并发按归属 Bot 统计**。同一 Bot 的所有执行器共用其额度。降限后让已启动事项继续，待占用低于新上限再自动补位。升限后待派事项随调度重试放行。容量之外的准入条件见[动态与事项](work.md)。
- **关联文件夹必须在后端所在的机器上真实存在**。CLI 实例的后端跑在沙箱里，宿主机上的路径（比如 `/home/swj`）在那里不存在，会返回「文件夹不存在：…」。沙箱里能用的路径有 `/data/agent/shared` 和 `/data/agent/bots/<id>/workspace`。
- **规矩的限制**：
  - 必须有名称、至少一个匹配条件（关键词、目录或类别），派活对象也必须是后端已注册的对象，否则返回「规矩需要名称、匹配条件和派活对象」。
  - 派活对象只看后端有没有注册，不看连接器能不能用。T3 连接器在测试实例里不可用（`available: false`），界面上这个选项是禁用的，但用 `api call` 写 `"assignee":"t3code"` 照样会被接受（实测如此）。
  - `rule.upsert` 总会把 `confirmed` 置为 true。
  - 聊天中由 Bot 提议的规矩，要你在卡片上确认后才会生效，见[提问与审批](attention.md)。
- **例行的限制**：
  - 名称、任务和时间都要有效，重复间隔至少 1 秒。
  - 一次性例行触发后会自动停用。
  - 例行到点后会让 Bot 开事项。上述一次性例行没有合成触发词，模型替身会回复 `DEEPBOT_VERIFY_OK`。
- **`bot-routines` 只能在没有例行的实例上跑。** 场景点的是「暂无例行」（`id:routines-empty`），有了例行之后，入口会变成「管理例行」（`id:routines-manage`），实测第二次运行会失败。要重跑，先 `env stop`，再 `data reset --apply`。`bot-rules` 可以重跑，但每跑一次就多一条同名规矩。
- **例行的「重复」用 `select` 选择。** `bot-routines` 选择「按此间隔」，再核对行内的「每 60 分钟」。
- **`text:配置` 用来点信息栏的标签。** 场景里先打开信息栏（`id:bot-info` 出现）再点它，避免和别处含「配置」的文字混淆。
- **本地时间**统一显示为 24 小时制 `YYYY-MM-DD HH:mm:ss`。日历日期无效或时间已过时会提示错误，已保存的时间保持原值。协议仍用毫秒时间戳。
- **添加后焦点**回到规矩的「匹配关键词」或例行的「等待时间（分钟）」。场景用 `key` 和 `value` 断言键入发生在对应字段。
- **视觉上**：配置页放在信息栏里，宽度不定，需要核对默认宽度和最窄宽度，见 [shell.test.tsx](../../apps/desktop/tests/shell.test.tsx) 中的 `bot configuration fits the default and minimum right panel widths`。规矩和例行的弹窗宽度为 `min(560, 窗口宽 - 32)`。规则见[弹窗](../../design/components/dialog.md)、[输入](../../design/components/input.md)。
