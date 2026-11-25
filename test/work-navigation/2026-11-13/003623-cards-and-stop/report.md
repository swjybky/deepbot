# 长文卡片、返回关闭与停止图标验证记录

- 时间与时区：2026-11-13 00:36–00:42，America/Los_Angeles（PST）
- 验证人：Codex
- 目标/触发条件：所有长文卡片先显示标题和两行摘要，点击展开/收起；停止图标位于返回右侧，已结束事项移除停止入口；详情同时保留顶部关闭按钮
- 代码：Git e3324505148f078e06725ca8b29470865efc6eb1，存在既有未提交工作；[源文件哈希](logs/source.sha256)、[工作区状态](logs/worktree-after.log)
- 环境：Ubuntu 26.04.1 LTS，NSH 0.4.0 (e626a8d)，Wayland，默认 GDK 后端，NSH 原生模拟输入；截图 1280×800，文字缩放 1.0，项目字体 Noto Sans CJK SC
- 数据：隔离 FixtureApp；longCards 数据含多行目标、验收、进度、产物、提问与动作说明；未读取用户真实数据或调用模型
- 参照：用户本轮明确要求所有长文卡片可展开；返回与关闭同时存在，停止图标只供未结束事项使用
- 总结论：全量 headless 54/54、原生卡片与导航专题 3/3 通过；类型检查受既有协议字段不一致阻挡

## 复现与预期

1. 修改前详情目标、进度、产物、提问动作直接铺开，停止是内容末尾的文字按钮；结束后仍保留禁用停止按钮
2. 修改前新增回归检查失败，见 [复现日志](logs/reproduce.log)
3. 共用 ActivityCard 默认标题单行、正文两行；点击标题/摘要展开完整原文，再次点击收起；提问的长动作说明合并进正文
4. 进度从无限长的 ListRow 描述改用共用长文卡片；产物卡片也自动支持折叠；批准/答复/打开文件等操作放在展开区域之外，不嵌套按钮
5. 列表卡片点击仍进入事项详情，详情内长文卡片默认收起；不改变原始数据
6. 未结束事项：返回右侧显示停止图标；已交付/取消等结束事项：无停止入口。结束状态更新后即时移除停止图标
7. 顶部关闭按钮始终保留，既可返回列表，也可从详情直接关闭面板

## 代码检查

命令工作目录均为仓库根目录。

| 命令 | 退出码/用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `nsh test apps/desktop --filter 'long cards expand'` | 0 / 1 | 四类长文展开收起与停止状态通过 | [专题](logs/cards-test.log) |
| `nsh test apps/desktop` 最终重跑 | 0 / 54 | 全量通过，包括原有聊天批准/答复、返回、关闭及事项分组 | [全量](logs/headless-final.log) |
| `pnpm check` | 1 | Agent 检查通过，桌面仍有既有 Bot/Work/Assignment/ExecutorStatus 等协议字段错误 | [检查](logs/check.log) |
| 原生 `--filter 'long cards expand'`，移开真实鼠标后 | 0 / 1 | 原生四类卡片展开/收起、停止操作与结束后隐藏通过 | [原生卡片](logs/native-pointer.log) |
| 原生 `--filter 'work detail'` | 0 / 2 | 详情返回与直接关闭面板通过 | [原生导航](logs/native-navigation.log) |

本轮日志未发现 unknown class。最终源文件哈希覆盖共用卡片、受影响业务组件、图标、Fixture、测试与设计规范。

## 原生截图与实际对比

以下原图均已通过图片查看工具实际打开。

| 检查项 | 参照/修改前 | 本次原生图片 | 实际观察 | 结论 |
| --- | --- | --- | --- | --- |
| 停止位置及原布局 | [同一普通 Fixture 修改前](screenshots/01-before.png) | [同一普通 Fixture 修改后](screenshots/08-short-after.png) | 顶部关闭保留，返回仍在 Tab 下；停止由详情末尾文字按钮移至返回右侧图标 | 通过 |
| 四类长文摘要 | 用户要求：标题与两行摘要；longCards 是本轮新造长文数据，没有同数据修改前截图 | [默认折叠](screenshots/02-collapsed.png) | 目标、进度、产物、提问动作均只显示两行正文，标题省略，卡片不无限撑高 | 通过 |
| 目标与验收全文 | 默认折叠 | [目标展开](screenshots/03-goal-expanded.png) | 完整标题、四段目标及验收标准可见 | 通过 |
| 进度全文 | 默认折叠 | [进度展开](screenshots/04-progress-expanded.png) | 四行进度含完整结尾可见 | 通过 |
| 产物全文 | 默认折叠 | [产物展开](screenshots/05-artifact-expanded.png) | 四行产物含完整结尾可见 | 通过 |
| 提问及动作全文 | 默认折叠 | [提问展开](screenshots/06-attention-expanded.png) | 提问、发布位置与动作完整展开，批准与答复保持独立 | 通过 |
| 事项结束后的操作 | 进行中有停止图标 | [停止后](screenshots/07-ended.png) | 显示已取消，停止图标消失，返回和顶部关闭仍存在 | 通过 |
| 详情直接关闭 | 有右侧详情 | [关闭后](screenshots/09-closed.png) | 面板收起，对话内容和输入条仍可用 | 通过 |

![摘要和停止图标](screenshots/02-collapsed.png)
![目标展开](screenshots/03-goal-expanded.png)
![停止后](screenshots/07-ended.png)

## 真实业务与产物

本轮只修改展示与现有停止入口位置，没有后端协议改动。Fixture 接收停止命令并投影结束状态；不将此结果当作真实执行者停止或模型业务验收。原生截图验证使用真实 GTK 渲染。

## 失败、未验证项与复验

- 初次原生点击未展开，[首轮日志](logs/native-cards.log)、[等待原生结果后的日志](logs/native-cards-wait.log)均保留。依据 ERR-006，临时 Mutter RemoteDesktop 会话将真实鼠标移出窗口后相同测试通过；结束后恢复鼠标位置并关闭会话。复验脚本见 [native-pointer.py](native-pointer.py)，未修改产品输入逻辑或系统设置
- 一轮全量测试中，其它正在进行的工作删除了已被发现的临时 zz-glideprobe.test.tsx，造成 54 项通过但命令失败，见 [该轮日志](logs/headless.log)。最终重新运行后 54/54、退出码 0；没有删除或修改其它工作的文件
- 全项目类型检查的既有协议字段错误未在此界面任务中扩展修复，不能宣称类型检查通过
- 原生预开详情 Fixture 不覆盖从 Bot 胶囊进入的真实完整入口，既有胶囊自动点击边界仍见 ERR-006；真实 sidecar 执行者停止不在本轮验证范围

## 最终结论

54 项 headless、四类卡片原生展开收起与停止状态、原生返回和关闭均通过；实际查看并对比截图。类型检查仍受既有错误阻挡，未宣称真实执行者/模型业务已验收。设计规则同步到 DESIGN.md、按钮与列表组件规范。
