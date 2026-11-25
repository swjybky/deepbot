#!/usr/bin/env bash
# 本地启动 DeepBot 桌面端：检查依赖 → 安装 node 依赖 → nsh run。
#
#   ./start.sh            本机后端（Linux: GTK 4 / macOS: AppKit / Windows: Win32）
#
# 其它参数原样传给 `nsh run`。验证改动用 skills/verify/SKILL.md 的验证 CLI。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$ROOT/apps/desktop"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
info() { printf '\033[2m› %s\033[0m\n' "$*"; }
fail() {
  red "✗ $1"
  [ $# -gt 1 ] && printf '  %s\n' "${@:2}" >&2
  exit 1
}

# ---- 依赖检查 -------------------------------------------------------------

command -v node >/dev/null || fail "找不到 node（需要 ≥ 24）" "https://nodejs.org"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 24 ] || fail "node 版本是 $(node -v)，需要 ≥ 24"

command -v pnpm >/dev/null || fail "找不到 pnpm" "corepack enable  或  npm i -g pnpm"
command -v cargo >/dev/null || fail "找不到 Rust（cargo）" "https://rustup.rs  （版本由 rust-toolchain.toml 固定）"
command -v nsh >/dev/null || fail "找不到 nsh CLI" "curl -fsSL https://nsh.dev/install.sh | sh"

TARGET=""
for arg in "$@"; do
  case "$arg" in
    --target=*) TARGET="${arg#--target=}" ;;
  esac
done
for ((i = 1; i <= $#; i++)); do
  [ "${!i}" = "--target" ] && { j=$((i + 1)); TARGET="${!j:-}"; }
done

if [ "$(uname -s)" = "Linux" ] && [ -z "$TARGET" ]; then
  pc() { PKG_CONFIG_PATH="${PKG_CONFIG_PATH:-}:/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/lib/pkgconfig:/usr/share/pkgconfig" pkg-config "$@" 2>/dev/null; }
  if ! pc --atleast-version=4.14 gtk4 || ! pc --atleast-version=2.40 webkitgtk-6.0 || ! command -v clang >/dev/null; then
    fail "Linux 本机运行需要 GTK 4.14+、WebKitGTK 6.0 开发包和 clang" \
      "sudo apt install libgtk-4-dev libwebkitgtk-6.0-dev clang"
  fi
fi

# ---- node 依赖 --------------------------------------------------------------

if [ ! -d "$ROOT/node_modules" ] || [ "$ROOT/pnpm-lock.yaml" -nt "$ROOT/node_modules/.modules.yaml" ]; then
  info "pnpm install"
  (cd "$ROOT" && pnpm install)
fi

# ---- 启动 -------------------------------------------------------------------

info "nsh run apps/desktop $*"
cd "$APP"
exec nsh run "$@"
