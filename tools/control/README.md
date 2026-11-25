# DeepBot 验证 CLI

在仓库根目录先执行 `pnpm install`。CLI 可用 `pnpm --silent verify` 或 `node tools/control/cli.mjs` 调用，stdout 始终输出一个 JSON 对象。子命令和分组都可加 `--help`。

```text
pnpm --silent verify env doctor
pnpm --silent verify env start
pnpm --silent verify ui run model-settings --run <runId>
pnpm --silent verify api snapshot --run <runId>
pnpm --silent verify ui run model-settings --target native --run <runId>
pnpm --silent verify check --run <runId>
pnpm --silent verify evidence review-input --run <runId>
pnpm --silent verify evidence report --run <runId>
pnpm --silent verify env stop --run <runId>
```

`api call` 和 `evidence review-save` 从 stdin 接收合成 JSON。可将项目自建的测试输入文件重定向到 stdin。下面的命令创建一个合成 Bot。

```bash
printf '%s\n' '{"bot":{"id":"verify-bot","name":"验证 Bot"}}' |
  pnpm --silent verify api call bot.upsert --run <runId>
```

## 依赖和隔离

- Linux、Bubblewrap 和本项目已安装的 Node 依赖为必需。缺少可用沙箱时启动报错。
- 浏览器操作还需 NSH、预装 Web runtime 和 Chromium 或 Chrome。原生验证还需 Xvfb、项目指定的 Rust 工具链、Cargo 依赖缓存、GTK、WebKitGTK 和本地字体。`DEEPBOT_VERIFY_XVFB` 可指定隔离测试机上的 Xvfb 可执行文件。
- CLI 在 `/var/tmp/deepbot-control-<uid>/<runId>/` 建立实例，用独立的网络、PID 和挂载命名空间，只挂载待测源码、工具链、依赖和本轮数据。测试后台使用合成模型，真实模型、T3 和 ACP 验收独立记录。
- 同一任务继续验收时用 `pnpm --silent verify env start --run <runId>` 复用实例。实例已经就绪且源码一致时沿用进程，源码变化时保留测试数据并重启。
- 原生场景和独立、关联的桌面检查共用当前工作区的 `check-target-*` Cargo 缓存，构建和运行期间互斥。缓存超过 24 GiB 时在锁内回收。临时源码工作区和原生数据库随场景结束回收。
- 正式桌面仍由 `./start.sh` 启动。CLI 浏览器场景使用 NSH Web 测试驱动和本轮真实 sidecar。原生场景用 `nsh test --target linux` 启动正式 `App.tsx`，在独立 X11 显示和独立数据库中重放。
- `evidence report` 生成报告时会重新计算工作区指纹。实例启动后代码又有改动时，`status` 为 `stale`。界面场景失败、检查失败或复核不匹配时，报告不会显示通过。
- 报告按宿主保留当前源码版本的全部场景运行，含同场景的重跑记录。视觉复核按运行顺序汇总全部原生截图。用 `--reference-run` 比较时，两轮复核的宿主和场景顺序须一致。
- `pnpm --silent verify check` 对隔离的工作区快照执行全量 lint、类型检查和离线测试。JSON 汇总每项状态、退出码、日志路径和失败后的处理提示。`--run` 可关联现有实例的验收证据。
- `pnpm --silent verify check --staged` 改用 Git 暂存区。运行 `git config --local core.hooksPath .githooks` 后，Git 在提交前调用同一个 CLI 检查暂存区。
- 功能地图检查覆盖界面入口、协议命令和场景引用。地图更新后需要让验收实例重载，失败时看 `map-check.log`。
- `check run --scope control` 可单独排查 CLI 回归，日志用 `logs read --source control-test` 读取。回归的集成用例各自启动隔离实例。
- 单个子进程最长运行 15 分钟。CLI 被 Ctrl-C 或强制结束后，下一条命令会回收遗留的实例锁。
- `ui serve` 在宿主 127.0.0.1 的随机端口提供连接本轮后端的网页，供浏览器工具执行场景不支持的操作。`ui close`、`env stop` 和 `env restart` 会关闭它。宿主端由 `forward.mjs` 转发到实例目录中的 Unix 套接字。
- 源码和数据校验通过后才执行破坏性操作。重置和删除默认预演。查看返回的目标，停止本轮实例后可用 `--apply`。

## 场景步骤

- `wait`、`gone`、`press`、`clear`、`submit`、`rightClick` 接收定位器。侧栏系统菜单使用原生宿主，右键后用 `{"chooseMenuItem": "重命名 Bot"}` 选择菜单项。
- `type` 和 `value` 接收 `[定位器, 文字]`，分别输入和验证字段值。`key` 给当前焦点控件发送单个英文字母、数字或 `backspace`。
- `select` 接收 `[触发器定位器, 选项定位器]`。选项出现后点击，例如 `{"select": ["id:t3-runtime-mode", "text:逐次审批"]}`。
- `screenshot` 接收由小写字母、数字和连字符组成的名称。删除按钮、删除菜单项和停止事项需要声明 `"destructive": true` 并用 `--apply` 执行。
- 本地模型收到 `DEEPBOT_VERIFY_WORK` 或 `DEEPBOT_VERIFY_ASK` 时，分别调用 `work_start` 或 `ask`，普通消息回复 `DEEPBOT_VERIFY_OK`。
- `api call connector.t3.configure` 仅用于保存合成测试的 `runtimeMode`。凭据字段会被拒绝。

参见 [功能地图](../../references/features/README.md)、[验证技能](../../skills/verify/SKILL.md) 和 [NSH 测试文档](https://nsh.dev/docs/testing-and-trace/)。
