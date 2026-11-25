# 资料库：长期记忆与产物

## 1. 功能说明

每个 Bot 有自己的资料库，分两部分：

- **「记住的事」**：长期记忆，可以手动添加、编辑、删除，Bot 也可以在聊天中自己记下。
- **「保存的资料」**：事项完成后留下的产物，包括文件、链接和文本。

点任意一条，会弹出预览弹窗。记忆在弹窗里可以编辑或删除，文件产物可以预览内容或用系统程序打开。

## 2. 用户路径

1. 点中间头部的 Bot 胶囊（`id:bot-pill`，无障碍名「查看 <名字> 的信息」），打开右侧信息栏（`id:bot-info`）。
2. 点信息栏里的「资料库」标签（`text:资料库`，`infoTab = "library"`）。
3. **加记忆**：在「希望 Bot 长期记住的事实」输入框（`id:memory-input`）输入，点「+」（`id:memory-add`）或按回车。新记忆出现在列表里，无障碍名为「预览记忆 <内容>」。
4. **看、改、删记忆**：点一条记忆，弹出「长期记忆」预览弹窗（`id:library-preview`，`modal = "libraryPreview"`），底部有「删除」（`id:memory-delete-<id>`）和「编辑」两个按钮。点「编辑」后可以改文字，再点「保存」。
5. **看产物**：「保存的资料」下的卡片点开后，文本直接显示，图片显示预览，文件读取内容预览，链接用系统浏览器打开。

## 3. 前后端对应

- **覆盖** 界面 `tab:library`、`modal:libraryPreview`；接口 `memory.upsert`、`memory.delete`、`artifact.preview`、`artifact.open`

| 层 | 位置 |
| --- | --- |
| 信息栏 | [BotInfoPanel.tsx](../../apps/desktop/ui/features/bot-info/BotInfoPanel.tsx)：`Library()` 和 `Memories()`；testID 有 `memories`、`memory-input`、`memory-add`、`library-memory-<id>` |
| 预览弹窗 | [LibraryPreviewDialog.tsx](../../apps/desktop/ui/features/bot-info/LibraryPreviewDialog.tsx)：`ArtifactPreview`、`MemoryPreview`；testID 有 `library-preview`、`library-preview-memory`、`memory-delete-<id>`。产物卡片见 [ArtifactCard.tsx](../../apps/desktop/ui/features/bot-info/ArtifactCard.tsx) |
| 文件读取 | 桌面按产物 ID 发 `artifact.preview` 或 `artifact.open`。后端按产物归属、当前权限和目录范围授权后读取或调用系统应用。Rust 桥只负责转发协议 |
| 后端接口 | `memory.upsert`：新建时 `revision` 为 1，之后每次加 1。`memory.delete`。都在 [runtime/app.ts](../../packages/agent/src/runtime/app.ts) 中处理 |
| 数据 | `deepbot.ledger` 文档的 `data.memories[]`，字段为 `id`、`botId`、`text`、`revision`、`sourceMessageIds`；`data.artifacts[]` 通过 `workId` 关联到事项 |
| 快照字段 | `snapshot.memories`、`snapshot.artifacts` |

## 4. 用 verify CLI 怎么驱动

```bash
R=$(pnpm --silent verify env start | node -pe 'JSON.parse(require("fs").readFileSync(0)).runId')

# 界面：打开信息栏 → 资料库 → 加「我每周五写周报」→ 打开预览
pnpm --silent verify ui run library-memory --run "$R"
pnpm --silent verify ui run library-memory --target native --run "$R"
pnpm --silent verify ui run library-artifact --target native --run "$R"

# 只走后端：用固定 id 加一条，读回，再删除（删除默认只预演）
printf '%s' '{"memory":{"id":"memory-verify","botId":"xiaocai","text":"喜欢简短回复","revision":1,"sourceMessageIds":[]}}' |
  pnpm --silent verify api call memory.upsert --run "$R"
pnpm --silent verify api snapshot --run "$R" | node -pe '
  JSON.stringify(JSON.parse(require("fs").readFileSync(0)).result.event.snapshot.memories)'
printf '%s' '{"memoryId":"memory-verify"}' | pnpm --silent verify api call memory.delete --dry-run --run "$R"
printf '%s' '{"memoryId":"memory-verify"}' | pnpm --silent verify api call memory.delete --apply --run "$R"

pnpm --silent verify env stop --run "$R"   # 用完停止实例。不再需要数据时，按验证技能「收尾」一步删除
```

记忆场景保存列表和弹窗截图，文件场景让合成模型登记隔离工作区中的测试文件，再打开弹窗核对文件内容。 [记忆场景](../../tools/control/scenarios/library-memory.json) · [文件场景](../../tools/control/scenarios/library-artifact.json)

## 5. 注意事项

- **界面里删除记忆没有确认框**。点「删除」就直接发出 `memory.delete` 并关闭弹窗，无法撤销。CLI 的 `api call memory.delete` 则默认只预演。场景里按到「删除」时必须声明 `destructive`，否则 CLI 会拒绝运行。
- **记忆必须属于存在的 Bot**，文字不能为空，否则返回「记忆无效」。删除不存在的 id 会返回「记忆不存在」。
- **同一实例上重跑浏览器场景会多出一条同名记忆**。所以场景用 `label:预览记忆 我每周五写周报 >> nth=0` 来点第一条。不加 `>> nth=0` 的话，第二次运行会报「matches 2 pressable views」。读回时要按 id 区分。
- **新记忆的 id 是随机的**（`memory-desktop-…`），场景里要用 `label:预览记忆 <内容>` 定位。
- `artifact.preview` 接收 `artifactId`，返回 `artifact.previewed`。图片、长文本和文件读取失败的界面回归通过 `check run --scope ui` 执行。 [library-preview.test.tsx](../../apps/desktop/tests/library-preview.test.tsx)
- 文件产物必须在 Bot 当前允许的目录内。关联目录移除或关闭文件权限后，后端会在下一次预览、打开或验收时重新检查。
- **资料只显示当前 Bot 自己事项的产物**，按 `work.ownerBotId` 过滤。
- **视觉上**：「记住的事」在上，「保存的资料」在下。记忆的预览弹窗高 320，产物的预览弹窗高 560。见[列表](../../design/components/list.md)、[弹窗](../../design/components/dialog.md)。
