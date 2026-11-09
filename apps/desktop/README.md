# DeepBot desktop

NSH mixed app: `App.tsx` is the chat UI (TSX on QuickJS); this directory is also a Rust crate (`Cargo.toml`,
`src/`; `nsh.json` `"rust": "."`) whose `#[native_module("deepbot/native")]` exports the `Agent` module.

`Agent` spawns the Pi Durable sidecar (`packages/agent`) with Node and relays JSON lines:
`Agent.start()`, `Agent.send(line)`, `await Agent.next()`. Env overrides: `DEEPBOT_AGENT` (script path),
`DEEPBOT_NODE` (node binary).

```sh
nsh run       # this machine's backend (Linux: GTK 4)
nsh check     # cargo check, then type checks App.tsx against .nsh/types
nsh package --target linux
```

Keep the `nsh-*` dependencies in `Cargo.toml` at the version of the `nsh` CLI you run.
