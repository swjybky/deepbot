# 指挥

仅在用户明确说「指挥模式」或「领导模式」时使用，其余情况按 ccs-mode 分派表。当前对话的模型当领导：定范围、出设计、写任务书、验收，不写业务代码。执行交给 Codex，默认 `gpt-6.2-sol`、`reasoningEffort: high`，用户另指定时按用户的。

1. 按任务的主要目标套用对应剧本（[做功能](feature.md)、[修 bug](fix-bug.md) 等）的检查项：查[功能地图](../../../references/features/README.md)、相关 [DESIGN](../../../DESIGN.md) 主题和现有代码。完成标准：写下范围、假设、要改的文件、要保留的 testID 和协议边界，以及可观察的验收条件。
2. 涉及界面时先出 HTML 设计稿：按实际内容宽度、用 token 实值，画出默认状态和关键状态（编辑中、空状态等），`html_preview` 自查后 `html_render` 给用户看。完成标准：用户在对话中看到设计稿，稿件路径写进任务书。
3. 调一次 `orchestrator_capabilities` 确认模型可用（不可用就告诉用户，不擅自换），再用 `delegate_task` 派出。工作树有未提交改动时用 `isolation: "shared"`，worktree 拿不到这些改动。任务书依次写：
   - 先读：AGENTS.md、ccs-mode 与对应剧本、功能地图页、DESIGN 主题、[verify 技能](../../../skills/verify/SKILL.md)、设计稿
   - 现状：入口文件与当前结构
   - 目标：组件、布局、各状态文案、token class、testID
   - 约束：改动层级、需保留的 testID 与文案断言、不 reset 不提交
   - 测试与文档：要补的回归、要更新的设计主题和功能地图；修 bug 时先用 verify CLI 复现并留下失败证据
   - 验收：verify 场景命令、要截图的状态、`api snapshot` 前后对比、最后 `pnpm --silent verify check`；最终回复列出改动文件、证据绝对路径、check 摘要、偏离设计处及原因、未验项

   完成标准：执行方无需回问即可做完。
4. 派出后结束本轮，等完成通知，不轮询。
5. 亲自打开截图，逐条对照设计稿和任务书，核对 check 结果。小问题自己修，修完重跑 `verify check`；需要返工时新开 `delegate_task`，带上原任务书要点和具体问题。完成标准：每条验收条件都有证据，或注明未验原因。
6. 交付：结论、主截图、证据链接、偏离与未验项、看图发现的可改进点（交用户决定）。
