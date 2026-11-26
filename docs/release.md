# 按需打包与发布 DeepBot

在默认分支合入 [Package DeepBot](../.github/workflows/release.yml) 后，从 GitHub 的 **Actions → Package DeepBot → Run workflow** 发起。版本填写 `X.Y.Z`，每段最多四位数字，例如 `1.0.1`。

## 只构建

选择待验收的分支，填写版本并让 `publish` 保持关闭。三个 runner 会构建发起时所选分支的同一个 commit。也可用 CLI 直接验证某个已有标签，版本须与标签一致。

```bash
gh workflow run release.yml --ref v1.0.1 -f version=1.0.1 -f publish=false
```

等 Linux、Windows、macOS 三项都通过后，在该次运行的 **Artifacts** 下载对应平台的包。每份 `build.json` 记录版本、commit、工具版本、检查项和 SHA-256。

## 正式发布

1. 给已验收且包含打包入口的 commit 建立 `vX.Y.Z` 标签并推送该标签。例如 `git tag -a v1.0.1 <commit> -m "DeepBot 1.0.1"`，然后执行 `git push origin refs/tags/v1.0.1`。首次使用先走「只构建」，也可在推送标签后用上面的命令验收同一标签。
2. 回到 **Run workflow**，选择默认分支，输入同一版本，勾选 `publish`。工作流会从 `refs/tags/vX.Y.Z` 解析并冻结源码 commit。日常提交和推标签本身均不会启动工作流。
3. 三个安装包全部从成品通过检查后，发布任务复核版本、commit、平台和 SHA-256，上传到草稿。GitHub 返回的五个制品摘要全部匹配后，草稿才转为正式 Release。完成后 Release 提供三个安装包、`SHA256SUMS` 和 `build-summary.md`。

同版本运行串行处理，后续请求可能替换 GitHub 尚在排队的请求。构建失败可重跑失败任务。上传失败时，重跑同版本会继续本工作流为该 commit 创建的草稿，保留摘要一致的文件，重新上传缺失或不完整的文件。已发布且制品齐全的同源 Release 会直接返回链接。手工创建的 Release、其他 commit 的草稿或含意外附件的 Release 需要先人工确认。重试期间保留原标签指向和草稿归属。构建使用 `contents: read`，只有发布任务使用 `contents: write`。

## 安装包与边界

| 制品 | 安装方式 | 适用范围与依赖 |
| --- | --- | --- |
| `DeepBot-X.Y.Z-linux-x64.tar.gz` | 解压后执行 `./install.sh`，在应用菜单打开 DeepBot。安装目录为 `~/.local/opt/DeepBot/X.Y.Z/`。 | runner 使用 Ubuntu 24.04 x64。桌面运行时需要 GTK 4.14+、WebKitGTK 6.0 和图形会话。Ubuntu 安装相应运行库 `libgtk-4-1`（部分版本为 `libgtk-4-1t64`）和 `libwebkitgtk-6.0-4`。 |
| `DeepBot-X.Y.Z-windows-x64-setup.exe` | 运行 Inno Setup 安装程序，从开始菜单打开 DeepBot。默认安装到当前用户的 `%LOCALAPPDATA%\Programs\DeepBot`。 | runner 使用 Windows Server 2025 x64，面向受支持的 Windows 10/11 x64。建立可信发布者需要 Authenticode 代码签名证书及签名、时间戳步骤。当前程序和安装包为无签名构建，Windows SmartScreen 可能提示或阻止运行。 |
| `DeepBot-X.Y.Z-macos-arm64.zip` | 解压，将 `DeepBot.app` 拖入「应用程序」。 | runner 使用 macOS 15 Apple Silicon，构建目标 macOS 14+ Apple Silicon。当前使用 ad hoc 签名，适用于本机或受控环境验证。给下载用户常规分发需要 Developer ID Application 签名、Hardened Runtime、Apple 公证并装订票据，GitHub 下载内容可能被 Gatekeeper 阻止。 |

三个包均含 NSH 原生应用、Node 和 Agent 的生产依赖。Agent 默认继续使用 `~/.deepbot`。每个平台从生成的安装包安装或解包，核对版本及包内组件，运行包内 Agent 检查 `ready` 和 `sync`，再从安装位置启动原生应用并观察隔离目录中的 SQLite 与 Agent 进程。该检查覆盖安装和启动，模型、外部连接及交互场景由各自的验收流程覆盖。

平台与工具版本参考 [NSH 0.4.0](https://github.com/longbridge/nsh/releases/tag/v0.4.0)、[Node 支持的平台](https://github.com/nodejs/node/blob/v26.13.1/BUILDING.md) 和 [GitHub runner 列表](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

签名和分发要求见 [Apple 公证文档](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) 与 [Microsoft SmartScreen 文档](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation)。

Windows 使用固定版本的 Inno Setup 6.7.3。个人非商业构建可直接运行。商业构建的许可证说明见 [Inno Setup 官方页面](https://jrsoftware.org/inno-setup/purchase)。

## 本地 Linux 只构建

在干净的 x64 源码检出中执行。准备 Node 26.13.1、仓库指定的 pnpm 和 Rust，以及 `clang libclang-dev libgtk-4-dev libwebkitgtk-6.0-dev xvfb xauth dbus-x11 desktop-file-utils`。已安装 NSH 0.4.0 时可直接使用。

```bash
# 首次安装固定版本的 NSH 后，按输出将 bin 目录加入 PATH。
node scripts/release/toolchain.mjs
pnpm install --frozen-lockfile
pnpm --filter @deepbot/agent deploy --prod --legacy --config.node-linker=hoisted dist/release-agent
GDK_BACKEND=x11 xvfb-run -a dbus-run-session -- node scripts/release/package.mjs 1.0.99
```

查阅 `dist/release/` 下的安装包和 `build.json`。命令同时打印临时安装位置和启动日志路径。反复打包时，可传入新的输出目录，例如 `node scripts/release/package.mjs 1.0.99 dist/release-agent dist/release-retry`。
