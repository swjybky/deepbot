# Bot 配置底部提示删除验证记录

- 时间与时区：2026-11-16 02:07–02:09 America/Los_Angeles (PST)
- 验证人：Codex
- 目标：删除配置页“修改后按回车或离开输入框即生效”提示
- 代码：e3324505148f078e06725ca8b29470865efc6eb1；工作区已有大量未提交修改，本次仅修改 BotConfiguration.tsx 的提示节点及未使用的 Text 导入，另追加验证资料
- 环境：Linux 7.0.0-43-generic、NSH 0.4.0 (e626a8d)、Wayland、GDK 后端默认；原生测试窗口 1280×800，默认缩放及项目 Noto Sans CJK SC 字体
- 数据：FixtureApp 协议隔离数据，不使用真实 sidecar 或私人数据
- 参照：用户提供的截图；与测试窗口宽度、数据不同，不作像素差分

## 复现与预期

1. 用户截图的关联文件夹输入框下面有立即生效说明
2. 本次删除该 Text，保留表单现有提交行为
3. 使用已有配置页用例打开真实 AppShell 的隔离配置 Tab，核对默认 320px 和最窄 240px 面板

## 代码检查

| 命令 / 工作目录 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| pnpm check / 根目录 | 0 | 通过 | [check.log](logs/check.log) |
| nsh test apps/desktop / 根目录 | 0 / 68 | 通过 | [headless.log](logs/headless.log) |
| nsh test apps/desktop --target linux --filter 'bot configuration fits' | 0 / 1 | 通过 | [native.log](logs/native.log) |

unknown class：本轮所有检查日志均未发现。

## 原生截图与实际对比

| 检查项与位置 | 参照 | 本次原生图片 | 实际查看结果 | 结论 |
| --- | --- | --- | --- | --- |
| 配置页底部说明 | [用户截图](screenshots/01-reference.png) | [默认宽度](screenshots/02-after-320.png) | 原说明已消失，关联路径输入框和添加按钮仍显示，底部没有提示占位 | 通过 |
| 窄配置栏 | 同上（视口不同） | [240px](screenshots/03-after-240.png) | 说明消失，窄栏输入控件仍在边界内 | 通过 |

已使用图片工具实际打开两张原生原图及用户参照图。原生截图新生成于本轮测试后复制归档。

## 真实业务与产物

原生既有专题通过：拖窄面板、删除关联文件夹、提交名字、切换模型均获得 Fixture 命令。截图来自预开配置页的 Fixture，不证明从用户业务窗口进入配置页的完整流程，也不证明真实 sidecar 持久化；该项未验证。本次为静态说明删除，不涉及后端及动画。

## 失败、未验证项与复验

- 用户正在运行的业务窗口是否热重载本次代码未验证；若仍显示提示需重新打开应用
- 原生操作历史边界见 ERR-006，本次未修改输入实现
- 不新增测试源码：静态文案删除，使用既有配置页测试验证显示与提交行为

## 最终结论

类型检查通过；原生显示与隔离 Fixture 专题通过；全量 headless 68/68 通过。真实用户窗口加载及真实 sidecar 持久化未验证。

对话直接展示本轮最终原生图片：screenshots/02-after-320.png（320px 配置栏，隔离 Fixture）。
