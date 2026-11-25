# 事项返回图标位置验证记录

- 时间与时区：2026-11-13 00:23–00:28，America/Los_Angeles（PST）
- 验证人：Codex
- 目标/触发条件：事项详情只显示一个返回图标，位于原文字按钮的位置；不同时显示面板叉号
- 代码：Git e3324505148f078e06725ca8b29470865efc6eb1；存在大量既有未提交改动，见 [工作区状态](logs/worktree-before.log)。本次涉及 BotInfoPanel.tsx、WorkDetail.tsx、work-list.test.tsx、DESIGN.md、design/components/button.md、design/layout.md 及验证记录；[被测源文件哈希](logs/source.sha256)
- 环境：Ubuntu 26.04.1 LTS；nsh 0.4.0 (e626a8d)；Wayland，GDK_BACKEND 未设置；NSH 测试原生输入；截图 1280×800，text-scaling-factor=1.0，scaling-factor=0（自动）；项目字体 Noto Sans CJK SC
- 数据：FixtureApp.tsx 隔离协议数据；未读取用户会话，未启动真实 sidecar 或模型
- 参照：本轮用户明确要求返回单独显示在原文字按钮的位置
- 总结论：位置修正、全量 headless、原生显示和预开详情后的返回点击通过；全项目类型检查受既有协议及依赖错误阻挡

## 复现与预期

1. 使用 workDetail 参数预开事项详情，修改前返回箭头仍在面板顶部
2. 将位置断言改为内容导航行后，修改前测试失败（expected 1 to be 0），见 [复现日志](logs/reproduce.log)
3. 修改后返回图标位于 Tab 下、详情卡片上；顶部不显示面板叉号，头像和 Tab 保持原高度
4. 进行中与已结束事项均可返回列表，列表恢复关闭按钮，没有残留返回入口

## 代码检查

以下命令均在仓库根目录执行。

| 命令 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| `nsh test apps/desktop --filter 'work '` | 0 / 4 | 通过 | [专题](logs/work-tests.log) |
| `nsh test apps/desktop` | 0 / 51 | 通过，含进行中及已结束详情返回 | [全量](logs/headless.log) |
| `nsh test apps/desktop --target linux --filter 'work detail renders one back icon'` | 0 / 1 | 原生显示通过 | [原生显示](logs/native.log) |
| 同一原生命令，补充真实点击返回与恢复列表断言后执行 | 0 / 1 | 通过 | [原生返回](logs/native-return.log) |
| `pnpm check` | 1 | 受阻：Agent 中旧 executorId/协议调用、缺失 executors 模块及 pi-codemode 依赖等 | [检查](logs/check.log) |
| `nsh check apps/desktop` | 1 | 受阻：既有 Fixture、Bot 配置、执行者与协议字段不一致 | [桌面检查](logs/desktop-check.log) |

本轮日志未发现 unknown class。

## 原生截图与实际对比

三张原图均已使用图片查看工具实际打开；相同 Fixture、窗口大小和字体。

| 检查项与位置 | 参照/修改前 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 返回位置 | [修改前](screenshots/01-before.png) | [修改后](screenshots/02-after.png) | 箭头从顶部约 y=32 移至 Tab 下约 y=258，位于详情卡片上方；无可见返回文字 | 通过 |
| 叉号与布局 | [修改前](screenshots/01-before.png) | [修改后](screenshots/02-after.png) | 详情页只有一个返回图标，无面板叉号；头像、标题、Tab 位置保持一致；系统窗口关闭按钮保留 | 通过 |
| 返回列表 | 详情页 | [返回后](screenshots/03-returned-list.png) | 真实点击返回后显示事项列表，返回图标消失，顶部面板叉号恢复 | 通过 |

![修改前](screenshots/01-before.png)
![修改后](screenshots/02-after.png)
![返回列表后](screenshots/03-returned-list.png)

## 真实业务与产物

本次仅调整导航按钮布局与展示条件，无后端行为变更；未调用真实模型。Fixture 验证原生布局和返回点击，不能证明真实 sidecar 业务链路或 Bot 胶囊入口可达。动画未改动，本轮不对动画作额外验收声明。

## 失败、未验证项与复验

- 全项目类型检查未通过，错误位于原有 Agent/协议及其调用方，未在本轮导航改动中扩展修复
- 原生使用 Fixture 预开详情；Bot 胶囊完整入口本轮未重新验证，其既有问题见 ERR-006
- 本轮原生返回按钮点击通过，不代表胶囊入口问题已修复
- 复验：运行上述原生专题；真实应用从 Bot 胶囊进入事项详情，核对返回图标位置及返回列表结果

## 最终结论

headless 51/51；原生位置显示、无重复关闭按钮和预开详情后的真实返回点击通过。类型检查仍失败；真实后端业务不属于本次布局调整的验收范围。
