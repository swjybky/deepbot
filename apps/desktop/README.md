# DeepBot desktop

NSH mixed app: `App.tsx` sets up the window and mounts `ui/` (TSX on QuickJS; layers and design rules in
[DESIGN.md](../../DESIGN.md)); this directory is also a Rust crate (`Cargo.toml`, `src/`; `nsh.json` `"rust": "."`)
whose `#[native_module("deepbot/native")]` exports the `Agent` module (wrapped by `ui/services/agent.ts`).

`Agent` spawns the Pi Durable sidecar (`packages/agent`) with Node and relays JSON lines:
`Agent.start()`, `Agent.send(line)`, `await Agent.next()`. Env overrides: `DEEPBOT_AGENT` (script path),
`DEEPBOT_NODE` (node binary).

Check and verify changes only through the [verify skill](../../skills/verify/SKILL.md):
`pnpm --silent verify check` from the repository root already runs Clippy, `nsh check` and
`nsh test`. Run the app locally with `./start.sh` from the repository root.

```sh
nsh package --target linux
```

Keep the `nsh-*` dependencies in `Cargo.toml` at the version of the `nsh` CLI you run.

The app icon is `assets/deepbot.png` (the selected purple jelly Bot), configured in
`nsh.json` for packaging. On Linux, run `node scripts/install-desktop.mjs` from the
repository root to add this checkout to the application launcher with the same icon.
It starts `start.sh` in development mode; rerun the installer after moving the checkout
or changing the icon. Requires `desktop-file-utils` for validation and cache updates.
Only Linux launcher display has been verified. The transparent artwork is the source
design; macOS/iOS need platform background and inset checks, and Android needs adaptive
icon layers and safe margins before those targets can be considered visually accepted.

The theme uses `Noto Sans CJK SC` for consistent Simplified Chinese glyphs. On Linux, install
`fonts-noto-cjk`; do not rely on the locale's default CJK fallback, which can select Japanese glyph
variants such as a visibly narrower “复”. Font availability on other platforms needs separate validation.

The Linux backend uses the local patch described in
[vendor/nsh-platform-linux/DEEPBOT-PATCH.md](../../vendor/nsh-platform-linux/DEEPBOT-PATCH.md).
It keeps font measurement and raster hinting consistent to prevent missing CJK strokes at medium
sizes, including the separate GTK input and placeholder contexts. It configures font rendering
only in the standalone app process. Cargo applies it to NSH's generated host through the
repository's `.cargo/config.toml`.
After changing this native patch, close the old desktop process and run `./start.sh` again; TSX hot
reload does not replace an already loaded native host.
