# 系统图标接入验证记录

- 时间与时区：2026-11-17 00:01–00:07，America/Los_Angeles（PST）
- 验证人：Codex
- 目标/触发条件：用户选定紫色果冻版并要求直接设置；随后询问手机与 Mac 的方形图标适配
- 代码：e3324505148f078e06725ca8b29470865efc6eb1；仓库存在原有大量修改。本次新增 assets/deepbot.png、scripts/install-desktop.mjs；仅在 nsh.json 添加 icon，桌面 README 添加说明，test 索引添加本记录
- 环境：Ubuntu 26.04.1 LTS，GNOME Wayland，NSH 0.4.0 (e626a8d)，默认 GDK 后端；实际显示器截图 1920×1080，文字缩放 1.0，系统缩放 automatic；应用默认 1280×800，未修改字体
- 数据：隔离 DEEPBOT_DATA_DIR 与 DEEPBOT_WORKSPACE，真实 sidecar，只验证启动与图标，无模型对话。测试后关闭本轮进程并清理隔离数据库，不归档模型配置或数据库
- 参照：用户选定 output/system-icon-2026-11-16/deepbot-jelly.png
- 总结论：Linux 配置、启动器、实际任务栏显示通过；Mac、iOS、Android、Windows 打包与实机未验证

## 复现与预期

1. 原配置没有 icon，本机没有 DeepBot desktop entry；未取得修改前原生 DeepBot 图标截图，不伪造前图
2. 把选定原 PNG 原样复制为 apps/desktop/assets/deepbot.png，nsh.json 引用同一路径
3. node scripts/install-desktop.mjs 将启动器注册为 com.example.deepbot.desktop，图标安装到用户 icons 目录；Exec 启动当前 checkout 的 start.sh
4. 核对 desktop 文件名、StartupWMClass 和原生 host --app-id 一致为 com.example.deepbot
5. 实际启动后应在 GNOME 任务栏显示紫色果冻 Bot

## 代码检查

| 命令 / 工作目录 | 退出码 / 用例数 | 结果 | 日志 |
| --- | --- | --- | --- |
| pnpm check / 根目录 | 0 | 通过 | [check.log](logs/check.log) |
| nsh test apps/desktop / 根目录 | 0，75/75 | 通过 | [headless.log](logs/headless.log) |
| node --check scripts/install-desktop.mjs | 0 | 通过 | 本次工具输出 |
| node scripts/install-desktop.mjs | 0 | 通过 | [install.log](logs/install.log) |
| desktop-file-validate 已安装入口 | 0 | 通过 | 安装过程与最终复核 |
| git diff --check | 0 | 通过 | 本次工具输出 |

unknown class：check/headless/native/launcher 日志均未匹配。组合检查命令的最终 rg 返回 1 表示无匹配，不是测试失败；单独检查退出码见 logs/*.exit-code。

## 原生截图与实际对比

| 检查项与位置 | 参照/修改前图片 | 本次原生图片 | 实际查看结果及差异 | 结论 |
| --- | --- | --- | --- | --- |
| 隔离真实应用，GNOME 任务栏 | 选定原 PNG，无前图 | [首次原生任务栏](screenshots/02-taskbar-icon.png) | 与参照同为紫色身体、白色竖眼、单背鳍；没有外部方形底板，轮廓清晰 | 通过 |
| 已安装启动器启动后 | 同上 | [启动器任务栏](screenshots/03-launcher-taskbar.png) | 图标一致，下方有运行指示点；host --app-id 与 desktop ID 一致 | 通过 |

是否实际打开原图：是。截图来自本轮 Mutter ScreenCast/PipeWire 实际桌面，裁出任务栏目标区域；不是合成图或设计稿。初始 GNOME Screenshot API 拒绝调用，改用可用的 Mutter 录屏接口，未更改桌面权限或 unsafe 设置。全屏包含用户其它窗口，仅保留目标裁图。
实际入口：gio launch 已安装的 desktop 文件；保留终端会话后成功启动。最初无保留终端的调用退出后没有留下应用，不作为成功依据。成功命令信息见 [launcher.log](logs/launcher.log)、[launcher-processes.log](logs/launcher-processes.log)。
没有改动应用内部布局、头像和交互，不以任务栏截图宣称业务流程验收通过。

## 真实业务与产物

- [安装后的 desktop 文件](artifacts/com.example.deepbot.desktop)
- [源图、项目资产、系统安装图的 SHA256](artifacts/icon-hashes.json)：三者完全相同，1254×1254 RGBA
- Gio DesktopAppInfo 查询结果：名称 DeepBot，图标 /home/swj/.local/share/icons/com.example.deepbot.png，命令 /home/swj/project/deepbot/start.sh
- 系统入口 /home/swj/.local/share/applications/com.example.deepbot.desktop 可在应用列表搜索 DeepBot
- 临时运行数据和测试窗口已清理；未覆盖 ~/.deepbot、未关闭用户原有应用

## 失败、未验证项与复验

- 当前配置使用透明原图，尚无平台专用背景/安全区变体；不能宣称跨平台一致
- Apple 当前规范要求 iOS/iPadOS/macOS 方形画布并由系统处理圆角，分层形式需背景层；Android adaptive icon 需要前景背景分层与安全区域。保留角色形象并按目标平台制作资源后，再在目标系统打包和查看实际截图
- [Apple 图标规范](https://developer.apple.com/design/human-interface-guidelines/app-icons.md)
- [Android adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)
- [NSH 图标配置与平台差异](https://nsh.dev/docs/packaging.md#icons)
- 未执行 Linux 发布打包；本机入口使用开发模式。其它系统未提供设备或构建环境，本次不记为通过
- 无重复通用 bug 修复，不新增 ERROR 条目

## 最终结论

Linux 配置与实际任务栏图标设置完成；类型与全量 headless 通过。用户选择的形象保持原样。其它平台的适配、打包与实机显示未验证。
对话直接展示最终实际任务栏截图 screenshots/03-launcher-taskbar.png。
