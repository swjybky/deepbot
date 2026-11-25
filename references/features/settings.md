# 设置：通用、电脑、权限

## 1. 功能说明

「我的设置」弹窗集中管理所有 Bot 共用的设置，左侧有五个分区。本页覆盖其中三个：

- **通用**：打开对话时是否自动展开 Bot 信息栏。这是本机偏好，不经过后端。
- **电脑**：本机服务的连接状态，以及「已连接的文件夹」。文件工具只在这些目录里运行。
- **权限**：Bot 能否读写本地文件、使用浏览器、发布前是否先问你、能否删除文件。

另外两个分区见[模型设置](model-settings.md)和[连接](connectors.md)。

## 2. 用户路径

1. 点左侧栏底部的账户行「deepbot」（`id:sidebar-account`，无障碍名「打开我的设置」），弹出设置弹窗（`modal = "settings"`），默认停在「通用」。
2. 点左侧导航切换分区：
   - 「通用」`id:settings-general`
   - 「电脑」`id:settings-computer`
   - 「权限」`id:settings-permissions`
3. **通用**：开关「打开对话时展开 Bot 信息」，拨动就生效。
4. **电脑**：在「连接一个绝对路径」输入框（`id:connected-folder-input`）填路径，点「连接文件夹」（`id:connected-folder-add`）。已连接的文件夹每行有一个「断开」按钮。
5. **权限**：四个开关（无障碍名就是开关的标题），拨动就生效。
6. 点右上角「关闭设置」关闭弹窗。

## 3. 前后端对应

- **覆盖** 界面 `modal:settings`、`settings:general`、`settings:computer`、`settings:permissions`；接口 `settings.update`

| 层 | 位置 |
| --- | --- |
| 弹窗 | [SettingsDialog.tsx](../../apps/desktop/ui/features/settings/SettingsDialog.tsx)：`sections` 定义五个分区，大小 920×660，testID 为 `settings`、`settings-<分区>` |
| 分区 | [GeneralSettings](../../apps/desktop/ui/features/settings/sections/GeneralSettings.tsx)、[ComputerSettings](../../apps/desktop/ui/features/settings/sections/ComputerSettings.tsx)、[PermissionSettings](../../apps/desktop/ui/features/settings/sections/PermissionSettings.tsx) |
| 前端状态 | [state/preferences.ts](../../apps/desktop/ui/state/preferences.ts)：`setPreference()` 写本机 NSH Storage；`setPermission()` 和 `setExecutor()` 发出 `settings.update` |
| 后端接口 | `settings.update` 可以只带一部分字段：`permissions` 的四个开关要一起传；`executor` 要传整个对象；`connectedFolders` 是完整列表；还有 `debounceMs`、`foregroundMaxTurns`、`maxConcurrent`。处理在 [runtime/app.ts](../../packages/agent/src/runtime/app.ts) 的 `case "settings.update"`，之后会重新配置每个 Bot 的前台对话和后台执行者 |
| 数据 | `deepbot.ledger` 文档的 `data.settings`。「通用」页的偏好存在本机 NSH Storage 的 `preferences` 键下，不在后端 |
| 快照字段 | `snapshot.settings`：`permissions`、`executor`、`connectedFolders`、`debounceMs`、`foregroundMaxTurns`、`maxConcurrent` |

## 4. 用 verify CLI 怎么驱动

```bash
R=$(pnpm --silent verify env start | node -pe 'JSON.parse(require("fs").readFileSync(0)).runId')

# 界面：切换权限开关 → 尝试连接不存在的文件夹
pnpm --silent verify ui run settings-permissions --run "$R"
pnpm --silent verify ui run settings-permissions --target native --run "$R"

# 后端：执行器（要传整个对象）、连接文件夹（必须是沙箱里存在的目录）、权限（四个开关一起传）
printf '%s' '{"settings":{"executor":{"thinkingLevel":"high","contextWindow":0,"images":true,"projectInstructions":true}}}' |
  pnpm --silent verify api call settings.update --run "$R"
printf '%s' '{"settings":{"connectedFolders":["/data/agent/shared"]}}' | pnpm --silent verify api call settings.update --run "$R"
printf '%s' '{"settings":{"connectedFolders":["/verify-missing-folder"]}}' |
  pnpm --silent verify api call settings.update --run "$R"  # 退出码 1，提示「文件夹不存在」
printf '%s' '{"settings":{"permissions":{"files":true,"browser":true,"confirmPublish":true,"deleteFiles":false}}}' |
  pnpm --silent verify api call settings.update --run "$R"

# 读回
pnpm --silent verify api snapshot --run "$R" | node -pe '
  JSON.stringify(JSON.parse(require("fs").readFileSync(0)).result.event.snapshot.settings)'

pnpm --silent verify env stop --run "$R"   # 用完停止实例。不再需要数据时，按验证技能「收尾」一步删除
```

场景文件是 [settings-permissions.json](../../tools/control/scenarios/settings-permissions.json)，截图包括两种权限开关和文件夹错误提示。

## 5. 注意事项

- **「允许删除文件」是权限开关。** `settings-permissions` 无需 `--apply` 即可拨动该开关，场景不执行文件操作。
- **权限开关会反转当前状态。** 首次场景关闭「使用浏览器」、开启「允许删除文件」。用快照核对实际值，重跑可用新实例。
- **权限开关只写进派工要求，代码并不拦截。** 界面底部写着「这些开关对它只写进派工要求，不由代码拦截」。验证时只能证明设置已经保存，不能证明 Bot 真的不会去做。
- **`permissions` 要四个键一起传，`executor` 要传整个对象。** 少传或类型不对，会分别返回「权限开关无效」「执行器配置无效」。`contextWindow` 只能是 0，或 32768 到 10000000 之间的整数。
- **连接文件夹使用沙箱路径。** 路径不存在时提示「文件夹不存在」，已有连接保留。普通文件会提示「连接路径必须是文件夹」。
- **`debounceMs` 可以设为 0 来加快测试**（范围 0 到 5000），测完记得改回 1200。聊天的合并窗口见[聊天发消息](chat.md)。
- 全局 `settings.maxConcurrent` 是兼容字段。派工使用[各 Bot 配置的事项并发上限](bot-configuration.md)。
- **「通用」页的偏好不在快照里**，`api snapshot` 读不到。原生场景每次用全新的 Storage，所以它总是默认值「关闭」。
- **视觉上**：设置弹窗 920×660，左侧导航宽 210。分区标题、分组和说明文字的规则见[弹窗](../../design/components/dialog.md)、[列表](../../design/components/list.md)。
- 设置持久化涉及的隔离数据目录见[启动、数据与重连](runtime.md)。
