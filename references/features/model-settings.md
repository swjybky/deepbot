# 模型设置

## 1. 功能说明

管理 Bot 可用的模型配置，包括新增、编辑、测试连接、设为默认和删除。一份配置包含提供方、模型 ID、API 类型、地址、密钥来源和输入能力。Bot 只保存配置的 `modelConfigId`，新建 Bot 时默认选当前的默认配置。

## 2. 用户路径

应用没有登录，也没有页面路由。设置是一个弹窗（`modal = "settings"`），左侧是分区导航。

1. 点左侧栏底部的账户行「deepbot」（`id:sidebar-account`，无障碍名「打开我的设置」），打开设置弹窗，默认停在「通用」。
2. 点左侧导航的「模型」（`id:settings-models`）。顶部摘要显示「N 个提供方 · M 个模型」（`id:model-summary`），右侧是「添加模型」按钮（`id:model-add`）。
3. 模型按提供方分组，默认是收起的。点分组行（`id:model-group-<provider>`，种子数据为 `openai`）展开后，每个模型显示为一张卡片（`id:model-card-<id>`），上面有「设为默认」「编辑」「测试连接」「删除」四个按钮。
4. 点「编辑」（`id:model-edit-<id>`），卡片下方展开编辑器（`id:model-editor`）。「输入能力」（`id:model-input-mode`）默认选「自动识别」。自定义模型支持图片时可选「文本和图片」，确定只支持文本时可选「仅文本」。
5. 点「保存」（`id:model-save`）后编辑器收起，列表显示新名称。点「取消」（`id:model-editor-cancel`）不会写入任何改动。

## 3. 前后端对应

- **覆盖** 界面 `settings:models`；接口 `model.upsert`、`model.add-many`、`model.list`、`model.test`、`model.default`、`model.delete`

| 层 | 位置 |
| --- | --- |
| 设置弹窗 | [SettingsDialog.tsx](../../apps/desktop/ui/features/settings/SettingsDialog.tsx)：`settings`、`settings-<分区>`。分区包括 `general`、`models`、`executor`、`computer`、`permissions`、`connectors` |
| 列表 | [ModelSettings.tsx](../../apps/desktop/ui/features/settings/sections/ModelSettings.tsx)：分组、卡片按钮、删除前的保护提示，以及系统确认框 `AlertDialog` |
| 编辑器 | [ModelEditor.tsx](../../apps/desktop/ui/features/settings/models/ModelEditor.tsx)：`model-name`、`model-provider`、`model-id`、`model-api`、`model-url`、`model-key`、`model-fetch`、`model-test`、`model-save`、`model-advanced`、`model-provider-id`、`model-env`、`model-remote`、`model-manual` |
| 后端接口 | 写入：`model.upsert`、`model.add-many`、`model.default`、`model.delete`。只查询、不写入：`model.list`、`model.test`，返回 `model.result`。见 [protocol.ts](../../packages/agent/src/protocol.ts) |
| 后端处理 | [runtime/app.ts](../../packages/agent/src/runtime/app.ts) 中的 `case "model.upsert"` 一组，以及处理 `model.list` 和 `model.test` 的分支，交给 [model-config.ts](../../packages/agent/src/runtime/model-config.ts) 的 `apply()` 和 `inspect()`。模型的实际调用在 [models.ts](../../packages/agent/src/runtime/models.ts) |
| 数据 | 不在 SQLite 里。配置存放在 `<数据根>/models.json`（`version`、`configs`、`defaultId`、`requests`），文件权限为 0600，原子替换写入。账本只保存 `data.modelConfigs` 和 `defaultModelConfigId` 这两份公开视图 |
| 快照字段 | `snapshot.modelConfigs[]`：`id`、`name`、`provider`、`model`、`api`、`baseUrl`、`apiKeyEnv`、`useCodexAuth`、`hasApiKey`、可选的 `inputMode`。密钥本身不会出现在快照里。另有 `snapshot.defaultModelConfigId` |

## 4. 用 verify CLI 怎么驱动

```bash
R=$(pnpm --silent verify env start | node -pe 'JSON.parse(require("fs").readFileSync(0)).runId')

# 界面：打开设置 → 模型 → 展开 openai → 编辑 default → 改名「验证模型」→ 保存
pnpm --silent verify ui run model-settings --run "$R"
pnpm --silent verify ui run model-settings --target native --run "$R"   # 结束时读原生数据里的 models.json 核对

# 读回
pnpm --silent verify api snapshot --run "$R" | node -pe '
  const s = JSON.parse(require("fs").readFileSync(0)).result.event.snapshot;
  JSON.stringify({ default: s.defaultModelConfigId, configs: s.modelConfigs.map(c => c.id + " / " + c.name) })'

# 测试连接：返回 model.result，ok 为 true，message 为「连接成功，模型已返回响应」
printf '%s' '{"config":{"id":"default"}}' | pnpm --silent verify api call model.test --run "$R"

# 删除默认模型：不加 --apply 只预演；加上后会被保护拒绝，退出码 1
printf '%s' '{"modelConfigId":"default"}' | pnpm --silent verify api call model.delete --run "$R"
printf '%s' '{"modelConfigId":"default"}' | pnpm --silent verify api call model.delete --apply --run "$R"

pnpm --silent verify env stop --run "$R"   # 用完停止实例。不再需要数据时，按验证技能「收尾」一步删除
```

场景文件是 [model-settings.json](../../tools/control/scenarios/model-settings.json)，截图为 `01-model-list`、`02-model-editor`、`03-model-saved`。场景里的 `expect.modelConfig` 会在结束后核对后端数据：浏览器目标核对 CLI 后端，原生目标核对原生数据目录里的 `models.json`。

## 5. 注意事项

- **测试实例只有一份配置** `default / 默认模型`，模型为 `verify-local`，地址指向沙箱内的替身 `127.0.0.1:23112`。用 `api call` 写配置时，地址只能指向这个替身，带 `apiKey` 的请求会被 CLI 拒绝。
- **保存后的断言要先 `gone` 掉 `id:model-editor`**。`text:<新名称>` 也会匹配到编辑器输入框里的文字，不先等编辑器消失，就可能在还没保存时误判为成功。
- **分组默认收起**。场景里要先 `press id:model-group-<provider>`，之后才能找到 `model-edit-<id>`。
- **删除有前后端两道保护**：默认模型、唯一的模型、被 Bot 引用的模型、正被运行中事项使用的模型都不能删。界面上按钮可以点，但只会弹出说明原因的警告；后端会返回 `API_REJECTED` 和解除条件。没有命中保护时，界面会弹系统确认框，CLI 场景操作不了这个框。验证删除流程时，用 `api call model.delete --apply` 或浏览器兜底。
- **模型正被调用时不能改它的配置**，会返回「模型正在运行，请结束后再修改」。在聊天回复期间改模型会命中这一条。
- **`model.list` 和 `model.test` 不写入任何数据**，但会占用一个 `requestId`。同一个 `requestId` 用不同内容重发时，返回「requestId 已被其他内容使用」。CLI 每次都会生成新的 `requestId`。
- **切换提供方会重新解析密钥**。同一提供方下密钥留空，表示保留原来的密钥。实例里没有真实密钥和外网，所以「拉取」和真实提供方的连接测试都没有验证过。
- **改默认模型不会改已有 Bot 的模型**。已有 Bot 仍用它原来的 `modelConfigId`，只有新建的 Bot 才会用新的默认值。
- **图片能力按配置解析**。`inputMode` 可取 `auto`、`text` 或 `image`，旧配置缺少该字段时按自动识别处理。自动识别匹配 Pi 目录中的模型 ID，兼容服务可沿用已知的上游 ID。私有别名由用户声明。手动选择优先于目录。批量添加时显式选择的能力用于本次所选模型。
- **视觉上**：编辑器是两列表单，放在卡片下方；展开的分组里每张卡片各占一行。曾经出现过两张卡片横排、被裁切的问题。改列表时至少用两份配置核对。见[弹窗](../../design/components/dialog.md)、[输入](../../design/components/input.md)、[token](../../design/tokens.md)。
- 手填模型 ID 时检查能否连续输入，曾有输入框提前失焦的问题。
