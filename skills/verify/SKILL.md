---
name: verify
description: 用 DeepBot 验证 CLI 证明改动正确。完成任何改动前运行全量 verify check 并全部通过。代码改动另在隔离环境按影响范围操作界面、调后端协议、读日志、取原生截图并生成报告。CLI 不支持的操作先用浏览器工具完成，再提议加进 CLI。
---

# 验证 DeepBot

## 规则

1. **任何改动完成前，必须在最后一次修改后运行 `pnpm --silent verify check` 并全部通过。** 以退出码 0、`ok: true` 和每项 `status: passed` 为准。失败时按 JSON 的 `nextAction` 和 `logPath` 处理，修完重跑全量检查。
2. 代码改动按影响范围用隔离实例走验收场景，交付时附证据。
   - 界面改动附原生截图，在回复里直接嵌入。
   - 后端或协议改动附接口返回，例如 `api call` 和 `api snapshot` 的 JSON。
   - 两类都附相关日志片段，以及 `evidence report` 的 `status`。
   - 没做到的项写明「未验证」和原因，不要写成通过。
3. CLI 不支持的操作，先用浏览器工具完成，见[CLI 做不到时](#cli-做不到时)。完成后在回复里提议把这个操作加进 CLI。用户同意前不改 CLI。

## CLI 是什么

- 入口是 `tools/control/cli.mjs`。在仓库根目录用 `pnpm --silent verify <组> <命令> [参数]` 调用分组命令。全量检查直接用 `pnpm --silent verify check`。`--silent` 让 stdout 保持为单个 JSON 对象。
- stdout 只输出一个 JSON 对象。成功时为 `{"ok":true,"runId":…,"result":…}`。失败时为 `{"ok":false,"error":{"code","message","nextAction"}}`，按 `nextAction` 处理。
- 退出码：0 成功，1 检查或运行失败，2 参数错误，3 环境未就绪或实例被占用。
- 参数以帮助为准：`pnpm --silent verify --help` 列出全部命令，`pnpm --silent verify <组> <命令> --help` 列出参数、默认值和示例。
- 同一任务首次用 `env start` 获取 `runId`，后续操作沿用这个 ID。再次执行 `env start --run "$R"` 会加载最新代码并保留测试数据，正在运行且源码相同时直接复用。`verify check --run "$R"` 把检查结果关联到场景报告。
- 实例目录为 `/var/tmp/deepbot-control-<uid>/<runId>/`，其中 `logs/` 放日志，`screenshots/` 放截图。实例在 Bubblewrap 沙箱里运行，有独立的网络和数据库。后端是真实的 Node sidecar，模型是本地替身，回复固定为 `DEEPBOT_VERIFY_OK`。
- 同一工作区的原生场景和桌面检查共用一份 Rust 缓存，构建和运行期间持锁。占用超过 24 GiB 时在锁内回收缓存。场景结束后回收临时源码工作区和原生测试数据库，截图和日志用于验收归档。
- 测试实例里没有真实模型、T3、ACP 和外网，涉及这些的验收须另行记录。

## 开始前

1. 在仓库根目录执行 `pnpm install`（只需一次）。
2. 执行 `pnpm --silent verify env doctor`，确认 `bwrap`、`nsh`、`browser` 和 `xvfb` 都是路径而不是 `null`。
   - `xvfb` 为空时，原生截图会报 `NATIVE_DISPLAY_MISSING`。解决办法是执行 `sudo apt install xvfb`，或者用 `export DEEPBOT_VERIFY_XVFB=<Xvfb 可执行文件>` 指定，然后重新 `env start` 或执行 `env restart --scope all`。
3. 查[功能地图](../../references/features/README.md)，找到受影响的功能页，读它的用户路径、CLI 命令和注意事项，见下文[功能地图](#功能地图)。改界面先按 [DESIGN.md](../../DESIGN.md) 的「按需加载约束」读相关主题，看图复核时对照这些条目。
4. 写下这次要证明的现象，例如「保存后列表显示新名称，后端读回同名」。

## 功能地图

[references/features/](../../references/features/README.md) 每个功能一页，分五节：功能说明、用户路径、前后端对应、用 verify CLI 怎么驱动、注意事项。

1. **改动前先查地图。** 从 README 的总表找到受影响的功能页，照它的「用 verify CLI 怎么驱动」选场景和 `api call`。地图写明 CLI 造不出来的（例如事项、提问卡片），按页里给的回归测试和兜底方式验证，并在交付里写明。
2. **改动影响了功能的路径、接口或操作方式，必须同步更新地图。** 包括以下情况：
   - 新增或删除弹窗、设置分区、信息栏标签、协议命令；
   - 改了控件的 `testID` 或无障碍名；
   - 改了命令字段或校验规则；
   - 新增场景；
   - 发现了新的坑。
   更新时改对应页的「覆盖」行、用户路径、CLI 命令和注意事项。新功能就新建一页，并加进 README 的总表。
3. **地图里的 CLI 命令要实际跑过才能写。** 没跑过的写成「未实测」。
4. **一致性由脚本把关。** `node scripts/check-feature-map.mjs` 会比对代码中的界面入口（`modal:`、`settings:`、`tab:`、`config:`）和协议命令，与各页「覆盖」行是否一致，同时检查场景是否都存在、都被引用。全量检查会执行该脚本，不一致时返回 `FEATURE_MAP_STALE`，日志路径见 JSON 的 `logPath`。

## 标准流程

下面的 `model-settings` 换成覆盖本次改动的场景。没有合适的场景就按[场景文件](#场景文件)新建一个。

```bash
R=$(pnpm --silent verify env start | node -pe 'JSON.parse(require("fs").readFileSync(0)).runId')
echo "$R"                                                              # 16 位 runId，后续都要用
pnpm --silent verify ui run model-settings --run "$R"                  # 无头浏览器操作界面
pnpm --silent verify api snapshot --run "$R"                           # 读回后端状态
pnpm --silent verify ui run model-settings --target native --run "$R"  # 原生窗口截图，首次要编译 Rust，可能需几分钟
pnpm --silent verify check --run "$R"                                  # 全量规则、类型检查和测试
pnpm --silent verify evidence review-input --run "$R"                  # 列出待复核截图
# 打开每张 PNG 看图，然后保存复核，见下文
pnpm --silent verify evidence report --run "$R"                        # status 为 passed 才算通过
pnpm --silent verify env stop --run "$R"
```

1. **改了代码就复用原实例。** 用 `pnpm --silent verify env start --run "$R"` 加载当前代码，之后重跑受影响的步骤。只改了 `apps/desktop` 且需要保留当前后端进程时，用 `env restart --scope ui --run "$R"`。`env status` 的 `fresh` 为 `false` 时说明源码需要重载。
2. **操作界面**用 `ui run <场景>`。场景文件在 `tools/control/scenarios/<名称>.json`，写法见[场景文件](#场景文件)。
   - 默认用无头 Chromium，与 CLI 后端共用数据。重跑会写数据的场景前，在同一实例上先 `env stop`，再预演并应用 `data reset`，恢复干净数据。需要并行验收或同时保留前后对照时，另开实例。
   - `--target native` 在私有 X11 显示里启动正式入口，使用本次场景专用的临时数据库。
   - 返回的 `result.screenshots[].path` 是截图位置。
   - 失败时会留下 `<前缀>-failed.png`，并在错误详情里列出截图。
3. **调接口**：
   - `api snapshot` 返回完整状态，数据在 `result.event.snapshot` 下。
   - `api call <type>` 从 stdin 读命令 JSON，字段见 `packages/agent/src/protocol.ts` 的 `Command` 类型。不用自己写 `requestId`，CLI 会补上。
   - 允许的命令和需要 `--apply` 的操作见 [API 命令策略](../../tools/control/api-policy.mjs)。未列出的类型返回 `COMMAND_INVALID`，按[CLI 做不到时](#cli-做不到时)处理。
   - 删除和取消类命令（`bot.delete`、`model.delete`、`memory.delete`、`work.cancel`）默认只预演，要执行须加 `--apply`。
   - 模型地址只能指向沙箱内的替身，带密钥的请求会被拒绝。
4. **读日志**：`logs read --source <源> [--tail N] [--request-id <id>]`。常用的源：
   - `agent`：后端 stderr
   - `protocol`：全部协议事件
   - `browser` 和 `native`：界面场景
   - `serve`：网页服务
   - `worker`：沙箱启动
   - `agent-test` 和 `ui-test`：检查日志
   - `map-check`：功能地图一致性检查
5. 用 `verify check` 执行全量检查，覆盖功能地图、`.lint`、Rust Clippy、两端类型检查和离线测试。每项结果都有独立日志。排查时可以先用 `check run --scope` 单独检查相关部分，修完后按第一条规则重跑全量。
6. **看图复核**：
   - 先用 `evidence review-input` 拿到截图路径、SHA-256 和设计条目。
   - 用能看图的工具逐张打开 PNG，对照设计条目检查布局、文字、间距、颜色和状态。
   - 用 `evidence review-save --run "$R"` 从 stdin 保存复核，`imageDigests` 必须按 review-input 返回的顺序排列。下面第一条命令列出截图路径和对应的摘要：

   ```bash
   pnpm --silent verify evidence review-input --run "$R" | node -pe 'JSON.parse(require("fs").readFileSync(0)).result.images.map(i => i.sha256 + "  " + i.path).join("\n")'
   printf '%s' '{"imageDigests":["<sha256-1>","<sha256-2>"],"checks":[{"rule":"design/components/dialog.md 弹窗","observation":"实际看到的现象","status":"passed"}]}' |
     pnpm --silent verify evidence review-save --run "$R"
   ```

   `status` 可选 `passed`、`failed`、`unverified`，只写实际看到的现象。
7. **报告**：最后一次改代码之后执行 `evidence report`。`status` 有四种取值：
   - `passed`：全部通过。
   - `failed`：看 `failed` 字段里的失败项。
   - `incomplete`：看 `missing` 字段，可能是缺 `checks:ui`、`checks:agent`、`ui:native` 或 `visual-review`。与本次改动无关的缺项（如纯后端改动没有原生图）在交付中写为未验证。
   - `stale`：测试后代码又改过，需要重启实例并重跑。
8. **收尾**：执行 `env stop`，归档所需截图和日志。确认本轮测试数据用完后，用 `data delete --run "$R"` 预演，核对目标后加 `--apply`。此命令也可按轮清理旧版本遗留的 `work/`，截图和日志会保留。

## 常见用法

```bash
# 造一个合成 Bot 并读回
printf '%s' '{"bot":{"id":"verify-bot","name":"验证 Bot"}}' | pnpm --silent verify api call bot.upsert --run "$R"
pnpm --silent verify api snapshot --run "$R"

# 发消息，拿到本地模型的回复
printf '%s' '{"botId":"xiaocai","threadId":"dm:xiaocai","text":"你好"}' | pnpm --silent verify api call message.send --run "$R"

# 测试模型连接
printf '%s' '{"config":{"id":"default"}}' | pnpm --silent verify api call model.test --run "$R"

# 预演删除，不写数据
printf '%s' '{"botId":"verify-bot"}' | pnpm --silent verify api call bot.delete --dry-run --run "$R"

# 按请求 ID 追协议日志
pnpm --silent verify logs read --source protocol --request-id <requestId> --run "$R"

# 只跑 Agent 的类型检查和测试
pnpm --silent verify check run --scope agent --run "$R"

# 重置为干净的种子数据。先停止实例，再预演，最后应用。应用后实例会自动重新启动
pnpm --silent verify env stop --run "$R"
pnpm --silent verify data reset --run "$R"
pnpm --silent verify data reset --apply --run "$R"
```

## 场景文件

`tools/control/scenarios/<名称>.json` 的格式：

```json
{
  "description": "这个场景证明什么",
  "design": ["DESIGN.md", "design/components/dialog.md"],
  "steps": [
    {"press": "id:sidebar-account"},
    {"wait": "id:settings-models"},
    {"clear": "id:model-name"},
    {"type": ["id:model-name", "新名称"]},
    {"gone": "id:model-editor"},
    {"screenshot": "01-saved"}
  ],
  "expect": {"modelConfig": {"id": "default", "name": "新名称"}}
}
```

- 支持的步骤：
  - `wait`、`gone`、`press`、`clear`、`submit`（在输入框上提交）、`rightClick` 接收一个定位器。
  - `type` 和 `value` 接收 `[定位器, 文字]`，分别输入文字和核对字段值。
  - `select` 接收 `[触发器定位器, 选项定位器]`，例如 `{"select": ["id:t3-runtime-mode", "text:逐次审批"]}`。
  - `chooseMenuItem` 接收菜单项文字，用于右键后的原生系统菜单，例如 `{"chooseMenuItem": "重命名 Bot"}`。
  - `key` 给当前焦点控件发送单个英文字母、数字或 `backspace`。
  - `screenshot` 接收截图名称。
- 定位写法有三种：
  - `id:<testID>`，对应组件的 `testID` 属性，在 `apps/desktop/ui/` 中搜索。
  - `label:<accessibilityLabel>`
  - `text:<文字>`。注意 `text:` 也会匹配输入框里的文字，所以检查保存结果前先 `gone` 掉编辑器。
- `screenshot` 的名称只能用小写字母、数字和 `-`。
- `expect.modelConfig` 会在场景结束后核对后端数据。
- 按到「删除、清空、重置、停止事项」类控件，或在菜单里选这类菜单项的场景，要声明 `"destructive": true`，并用 `--apply` 运行。
- 新增场景参照 `model-settings.json`。

## CLI 做不到时

场景能完成[场景文件](#场景文件)列出的步骤。滚动、拖拽、悬停、组合键和除字母、数字、退格以外的按键（例如 Esc、方向键）等操作，场景表达不了。

1. 执行 `pnpm --silent verify ui serve --run "$R"`，返回 `url` 和 `api`，都只监听 127.0.0.1。网页连的是本轮 CLI 后端，数据和 `api call` 共用。
2. 用当前环境的浏览器工具打开 `url`，例如 T3 的 `preview_open`、Playwright 或 Chrome DevTools。等页面出现「小菜」后再操作。删除类操作需要以 `ui serve --apply` 启动。
   - 每个动作后都等页面出现预期变化再继续。例如输入后按回车，要等到消息出现在对话里。
   - 没变化就先取页面快照，对目标控件重做一次，并在报告里记下。实测中紧跟在输入后的第一次回车可能丢失。
3. 用浏览器工具保存截图，再用 `api snapshot` 或 `logs read --source protocol` 读回结果。网页发出的请求 ID 以 `desktop-` 开头。
4. 执行 `ui close --run "$R"`，关掉浏览器标签页。
5. 网页不会热更新。改代码后执行 `env restart`（会顺带关闭网页），再重新 `ui serve`。
6. 浏览器工具的截图是 Web 宿主的画面，不能代替原生截图，也不计入 `evidence report`。在报告里单独列出，标明「浏览器工具补充」。
7. 在回复里提议加进 CLI，写清三点：
   - 做了什么操作；
   - 为什么现有命令做不到；
   - 建议的形式，例如新的场景步骤 `{"submit": "id:…"}`、新命令，或给 `api call` 加参数。
   用户同意后再改 `tools/control/`，并在 `tools/control/cli.test.mjs` 中补回归。

## 留证与交付

- 归档到 `test/<功能>/<本地日期>/<时间>-<主题>/`，内含：
  - `report.md`，按[报告模板](../../test/_template/report.md)写；
  - `screenshots/`：从实例目录复制实际看过的截图；
  - `logs/`：相关日志；
  - `artifacts/`：接口返回、`evidence report` 的 JSON、复核 JSON。
- 更新 [test 索引](../../test/README.md)。
- 报告记录这些内容：命令和退出码、`runId`、`sourceVersion`、机器与 NSH 版本、数据来源、未验证项。
  - 全部证据来自同一个 `runId`。
  - 不要粘贴密钥。
- 回复中嵌入关键原生截图，写出 `evidence report` 的 `status`，并给出报告链接。
- 可能复发的问题，按 ccs-mode 的[错误变规则](../../.agents/skills/ccs-mode/SKILL.md#错误变规则)选择防复发手段。

## 常见错误

| 现象 | 处理 |
| --- | --- |
| `RUN_ID_REQUIRED` 或 `RUN_NOT_FOUND` | `--run` 要用 `env start` 返回的 runId |
| `RUN_BUSY` | 同一实例有命令在执行。等它结束，或用 `env status` 的 `busy` 查看在做什么。CLI 被中断后遗留的锁会自动回收 |
| `AGENT_NOT_READY` | 用 `logs read --source worker` 和 `--source agent` 查原因，再执行 `env restart --scope all` |
| `NATIVE_DISPLAY_MISSING` | 见「开始前」第 2 步 |
| `UI_FAILED` | 用 `logs read --source browser` 或 `--source native` 看最后一步，打开错误详情里的 `-failed.png` |
| `FEATURE_MAP_STALE` | 代码里的入口或命令与功能地图不一致。按日志列出的缺项更新 `references/features/`，见[功能地图](#功能地图) |
| `RUN_ACTIVE` | `data reset` 和 `data delete` 加 `--apply` 前先执行 `env stop` |
| 报告为 `stale` | 测试后改了代码，重启实例后重跑 |
| `BUILD_CACHE_BUSY` | 等待同工作区的原生场景或桌面检查结束，然后继续使用当前 runId |
