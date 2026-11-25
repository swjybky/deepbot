# 选择卡片答复后只留已选项、徽标用 Bot 颜色 验证记录

- 时间与时区：2026-11-16 01:24–01:35 PST
- 验证人：Claude（代理执行）
- 目标/触发条件：用户参照截图要求“选完之后剩下的选项就不显示了”；并要求对话中的强调色与 Bot 形象颜色统一
- 代码：Git SHA e332450 + 未提交改动；本次涉及 `apps/desktop/ui/components/ChoiceCard.tsx`、`ui/features/chat/AttentionCard.tsx`、`tests/choice-card.test.tsx`、`tests/shell.test.tsx`、`design/components/list.md`、`design/tokens.md`。上一轮见 [010436-choice-card](../010436-choice-card/report.md)
- 环境：Linux 7.0.0-43-generic，GNOME Wayland，nsh 0.4.0，窗口 1280×800，缩放 1，Noto Sans CJK SC
- 数据：协议 Fixture（`choiceCards`），Bot「小菜」颜色 `#9EC5A7`；不连真实 sidecar
- 参照：用户截图（已答卡片问题变灰、只剩 A 选项且字母徽标彩色填充）
- 总结论：代码检查通过；原生显示与 Fixture 原生交互通过；真实业务未验证

## 复现与预期

1. 点选项 C “遇到卡点” → 卡片只剩 C 行，徽标为 Bot 颜色，问题变灰，其它选项与“其他”输入消失
2. 在批准卡片“其他”输入“改天再发”并答复 → 只剩 C “改天再发”
3. 未答复卡片保持全部选项

## 代码检查

| 命令 / 工作目录 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `pnpm check`（仓库根） | 0 | 通过 | [check.log](logs/check.log) |
| `nsh test apps/desktop` | 0 / 60 通过 | 通过；新断言检查其它选项不再显示 | [headless.log](logs/headless.log) |
| 原生 `tests/choice-card.test.tsx --target linux`，移开真实鼠标 | 0 / 3 通过（首轮） | 通过 | [native-pointer-1.log](logs/native-pointer-1.log) |

unknown class 检查：无匹配。

## 原生截图与实际对比

| 检查项与位置 | 参照/修改前图片 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 未答复 | 上轮 [02-open.png](../010436-choice-card/screenshots/02-open.png) | [01-open.png](screenshots/01-open.png) | 无变化，全部选项与“其他” | 通过 |
| 选项答复后 | 上轮 [04-answered.png](../010436-choice-card/screenshots/04-answered.png)（保留全部行、黑色徽标、“已答复”） | [02-answered.png](screenshots/02-answered.png) | 只剩 C “遇到卡点”，徽标为小菜绿色，问题灰字；卡片高度收缩 | 通过 |
| 自定义答复后 | 上轮 [06-other-answered.png](../010436-choice-card/screenshots/06-other-answered.png) | [03-other-answered.png](screenshots/03-other-answered.png) | 只剩 C “改天再发”，动作说明仍为两行摘要，可展开 | 通过 |

是否实际打开原图：是。Fixture 颜色 `#9EC5A7` 较浅，白字对比偏低；真实调色板为饱和色（[avatar.ts](../../../../apps/desktop/ui/theme/avatar.ts)），未逐色截图。

## 真实业务与产物

| 操作/输入 | 预期 | 实际结果 | 后端证据/产物及校验值 | 结论 |
| --- | --- | --- | --- | --- |
| 真实 Bot 提问后答复 | 后端收到答复，卡片只留已选项 | 未执行 | — | 未验证 |

## 失败、未验证项与复验

- 真实 sidecar、真实鼠标点击与指针、各调色板颜色下白字对比：`./start.sh` 启动后让不同颜色 Bot 提问并答复
- 关联：ERR-006

## 最终结论

代码检查通过；原生显示通过；Fixture 原生交互通过；真实业务未验证。

对话中展示的最终结果图片：`screenshots/02-answered.png`（选项答复后）、`screenshots/03-other-answered.png`（自定义答复后）。
