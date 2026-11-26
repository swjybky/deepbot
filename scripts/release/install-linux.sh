#!/bin/bash
set -euo pipefail

package_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'DeepBot requires Linux x86_64.' >&2; exit 1; }
runtime="$package_dir/app/deepbot-runtime"
version=$("$runtime/node" -p 'require(process.argv[1]).version' "$runtime/build-info.json")
[[ "$version" =~ ^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$ ]] || { echo 'Invalid package version.' >&2; exit 1; }

base="$HOME/.local/opt/DeepBot"
app="$base/$version"
applications="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p -- "$base" "$applications"
exec 9>"$base/.install.lock"
flock 9
staged=$(mktemp -d "$base/.install.XXXXXXXX")
desktop_tmp=$(mktemp "$applications/.deepbot.XXXXXXXX.desktop")
trap 'rm -f -- "$desktop_tmp"; rm -rf -- "$staged"' EXIT

if [[ -e "$app" ]]; then
  cmp -s -- "$runtime/build-info.json" "$app/deepbot-runtime/build-info.json" ||
    { echo "A different build of DeepBot $version is already installed at $app." >&2; exit 1; }
else
  cp -a -- "$package_dir/app" "$staged/app"
  mv -T -- "$staged/app" "$app"
fi
"$app/deepbot-runtime/node" --input-type=module - "$app" > "$desktop_tmp" <<'JS'
const path = process.argv[2];
const value = (s) => s.replaceAll("\\", "\\\\").replaceAll("\n", "\\n");
const execArg = (s) => value('"' + s.replace(/[\\"\x60$]/g, "\\$&").replaceAll("%", "%%") + '"');
console.log([
  "[Desktop Entry]",
  "Type=Application",
  "Name=DeepBot",
  "Exec=" + execArg(path + "/DeepBot"),
  "Icon=" + value(path + "/com.example.deepbot.png"),
  "Terminal=false",
  "Categories=Utility;",
  "StartupNotify=true",
  "StartupWMClass=com.example.deepbot",
].join("\n"));
JS
if command -v desktop-file-validate >/dev/null; then
  desktop-file-validate "$desktop_tmp"
fi
desktop="$applications/com.example.deepbot.desktop"
if [[ -e "$desktop" ]] && ! cmp -s -- "$desktop_tmp" "$desktop"; then
  backup=$(mktemp "$base/launcher.XXXXXXXX.desktop")
  cp -a -- "$desktop" "$backup"
fi
chmod 644 "$desktop_tmp"
mv -fT -- "$desktop_tmp" "$desktop"
printf 'Installed DeepBot %s at %s\n' "$version" "$app"
