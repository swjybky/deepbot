#!/usr/bin/env bash
# Optional ACP executor, installed privately without changing global npm packages.
set -euo pipefail
data_dir="${DEEPBOT_DATA_DIR:-$HOME/.deepbot}"
DEEPBOT_ACP_TOOL_DIR="$data_dir/tools/codex-acp"
mkdir -p "$DEEPBOT_ACP_TOOL_DIR"
chmod 700 "$data_dir"
npm_config_cache="$data_dir/cache/npm" npm install --prefix "$DEEPBOT_ACP_TOOL_DIR" --no-audit --no-fund @agentclientprotocol/codex-acp@2.6.0
printf '已安装 Codex ACP：%s\n' "$DEEPBOT_ACP_TOOL_DIR/node_modules/.bin/codex-acp"
printf '重启 DeepBot 后自动发现；登录由本机 Codex 提供\n'
