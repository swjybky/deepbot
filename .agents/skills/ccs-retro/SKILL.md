---
name: ccs-retro
description: DeepBot 的 agent 工作流出问题后复盘时使用，用户说「用 ccs-retro 诊断一下」或要求做流程体检时也用。判断是哪一层失效，在最可靠的那层修，修完提醒用新对话回归。
---

# ccs-retro

三个入口：诊断、修复、体检。诊断和体检只给结论和方案，等用户确认后再改。路径都以仓库根目录为起点。

## 层次对照

| 现象 | 失效的层 | 修在哪里 |
| --- | --- | --- |
| 启动不了、截不了图、临时写一次性脚本、绕开 CLI 用浏览器工具 | verify CLI | `tools/control/`、[verify 技能](../../../skills/verify/SKILL.md) |
| 找不到功能、改错地方、漏掉受影响功能、走错用户路径 | 功能地图 | [references/features/](../../../references/features/README.md)、`scripts/check-feature-map.mjs` |
| 同一种错第二次出现、写法不统一、越过目录边界 | 规则 | `.lint/`、[rules/README.md](../../../rules/README.md) |
| 跳步骤、没给证据、没实际运行就说完成、没按要求复述 | 剧本 | `.agents/skills/playbooks/` |
| 选错剧本、小任务流程太重、大任务太草率 | ccs-mode 分派 | [ccs-mode](../ccs-mode/SKILL.md) 第 3 步 |
| 跨对话丢上下文、重复踩坑 | handoff | [handoff](../handoff/SKILL.md)、`notes/handoff/` |
| 自信地解释错了 | explain | [explain](../explain/SKILL.md) |
| 理解错了需求 | 需求表达，不改流程 | 建议用户用 reframe 或 sharpen |

## 诊断

1. 用大白话复述发生了什么。
2. 对照上表判断失效的层，可以有多个，按主次排序。
3. 每个判断给出依据：当时读了哪个文件、哪一步按什么做的、缺了什么信息。
4. 按 ccs-mode 的[错误变规则](../ccs-mode/SKILL.md#错误变规则)从上往下选第一个能用的修法：能做成工具或检查的，不改文字。
5. 只是偶发、流程本身没问题时，直接说明，不改流程。

完成标准：给出复述、分层结论及依据、修复方案后停下，等用户确认。

## 修复

只改诊断确认的那一层，保留其它内容。

- **CLI**：沿用现有约定，包括单个 JSON 输出、错误带 `nextAction`、破坏性操作有 `--dry-run`、`--help` 写清参数。实际运行一次成功、一次故意失败，贴出两次输出。在 `tools/control/cli.test.mjs` 补回归，更新 verify 技能用法，并把功能地图里能改用新命令的地方一并改掉。
- **功能地图**：用户路径和 CLI 命令实际跑一遍再写。坑写进「注意事项」，同模块其它页一起核对。说明检查脚本为什么没发现，能补的就补进 `check-feature-map.mjs`。
- **规则**：说明根因，写一个应报错和一个应通过的样例，进 `scripts/check-rules.test.mjs`。修掉全仓库存量问题，在 `rules/README.md` 登记来历。
- **剧本或技能**：只改出问题的那步，写成动作加可观察的完成标准，守住 ccs-mode「[改进剧本](../ccs-mode/SKILL.md#改进剧本)」里须保留的步骤。改完仍要在一页以内，超了就删掉已被工具或规则接管的内容。列出改动前后的差异。
- **分派**：说明当时为什么这样判断。把判断依据写得更明确，例如原因是否已知、是否需要设计取舍、改动范围大小。用三个不同类型的示例任务说明改后分到哪里，交用户确认。
- **handoff、explain**：先分清是没触发、写得不够还是读的时候没用上，再针对性修改。说明下次同样情况会有什么不同。

每次修复都要：

1. 在 [CHANGELOG.md](../CHANGELOG.md) 记一行，写日期、改了什么、因为什么问题。来历只记在那里，不写进技能正文。
2. 运行 `pnpm --silent verify check`，全部通过。
3. 提醒用户开全新对话回归，提示词如下。

> 这是一次流程回归测试。请只根据项目里的技能、剧本和功能地图，重新完成这个任务：<出问题的任务或同类小任务>。完成后报告：1. 是否还会出现之前的问题：<描述>；2. 过程中还有哪些说不清、走不通的地方。

## 体检

建议每周一次。重点是找能删的内容。

1. 读最近一周的 `git log`、[CHANGELOG.md](../CHANGELOG.md)、`rules/README.md` 的新增记录和 `notes/handoff/`。找出重复出现的问题类型，判断是否有某一层反复失效。
2. 逐个检查 `.agents/skills/` 和 `skills/` 下的技能与剧本：哪些内容已被工具或规则接管，哪些超过一页，哪些互相矛盾或重复。
3. 运行 `node scripts/check-feature-map.mjs` 和 `pnpm --silent verify check`，报告结果。
4. 列出 `notes/handoff/` 里任务已完成却没删的笔记。

完成标准：输出问题清单和按价值排序的改动建议，等用户确认后再改。体检后可接着用 [ccs-distill](../ccs-distill/SKILL.md) 批量挖掘同一时段的对话，沉淀做得好的地方。
