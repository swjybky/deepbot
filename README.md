# deepbot
一款简洁的个人 bot 应用

## 架构

```
apps/desktop      NSH (Native Shell) 桌面端：App.tsx（界面，QuickJS）+ src/（Rust 原生模块）
packages/agent    Agent sidecar：Pi Durable（@earendil-works/pi-durable）运行在 Node 上，SQLite 持久化
apps/mobile       移动端（规划中）
```

NSH 的 TSX 运行在 QuickJS 上，而 Pi Durable 需要 Node，所以 agent 作为 sidecar 进程运行：
桌面端的 Rust 模块 `Agent`（`apps/desktop/src/sidecar.rs`）负责启动它，双方通过 stdin/stdout 上的
JSON-lines 通信，协议定义见 `packages/agent/src/protocol.ts`。会话保存在
`~/.local/share/deepbot/session.sqlite`，进程中断后重启会自动续跑未完成的回复。

## 开发

依赖：Node ≥ 24、pnpm、Rust（由 `rust-toolchain.toml` 固定版本）、[nsh](https://nsh.dev) CLI，
Linux 上还需要 GTK 4.14+：

```bash
sudo apt install libgtk-4-dev clang
```

```bash
pnpm install
export ANTHROPIC_API_KEY=...        # 可选：DEEPBOT_MODEL（默认 claude-sonnet-5-5）、DEEPBOT_DATA_DIR
pnpm dev                            # nsh run apps/desktop
pnpm check                          # agent 类型检查 + nsh check
```

## 开源协议

本项目采用 [Apache License 2.0](LICENSE) 开源协议。

Copyright 2026 swjybky
