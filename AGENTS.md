# AGENTS.md

DeepBot 是个人 bot 应用。桌面端是 NSH 原生 TSX，运行于 QuickJS。应用结构和 Agent sidecar 见 [README.md](README.md)。

## 工作入口

接到任务先读 [ccs-mode](.agents/skills/ccs-mode/SKILL.md)，按任务选择剧本，再按 [功能地图](references/features/README.md) 了解入口和注意事项。开发与交付使用 [verify](skills/verify/SKILL.md)。

- 明确本次范围、假设和可观察的验收目标。多步骤工作先列短计划。重大歧义向用户确认。
- 复用已有实现，优先修共同入口，保留无关改动。防复发手段按 ccs-mode 的[错误变规则](.agents/skills/ccs-mode/SKILL.md#错误变规则)选择。需要判断的约定写进对应文档。
- 修改界面前按 [DESIGN.md](DESIGN.md) 的「按需加载约束」选择相关主题。对照原生截图判断视觉和交互，按 [verify](skills/verify/SKILL.md) 记录验收结果。
- 改动协议或持久化格式时，明确旧数据的迁移和断线重连后的预期行为。
