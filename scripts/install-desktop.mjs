#!/usr/bin/env node
// Register this checkout's development launcher and its icon on Linux.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

if (process.platform !== "linux") throw new Error("此启动器安装脚本仅适用于 Linux");
const root = resolve(import.meta.dirname, "..");
const app = join(root, "apps/desktop");
const config = JSON.parse(readFileSync(join(app, "nsh.json"), "utf8"));
const data = process.env.XDG_DATA_HOME || join(homedir(), ".local/share");
const applications = join(data, "applications");
const icon = join(data, "icons", `${config.id}.png`);
const desktop = join(applications, `${config.id}.desktop`);
mkdirSync(applications, { recursive: true });
mkdirSync(dirname(icon), { recursive: true });
copyFileSync(join(app, config.icon), icon);
// Desktop Entry values and Exec arguments use separate escaping rules.
const value = (s) => s.replaceAll("\\", "\\\\").replaceAll("\n", "\\n");
const executable = value(`"${join(root, "start.sh").replace(/[\\"`$]/g, "\\$&").replaceAll("%", "%%")}"`);
writeFileSync(desktop, `[Desktop Entry]
Type=Application
Name=${value(config.name)}
Comment=个人 Bot 应用
Exec=${executable}
Path=${value(root)}
Icon=${value(icon)}
Terminal=false
Categories=Utility;
StartupNotify=true
StartupWMClass=${config.id}
`);
execFileSync("desktop-file-validate", [desktop], { stdio: "inherit" });
execFileSync("update-desktop-database", [applications], { stdio: "inherit" });
console.log(`启动器：${desktop}\n图标：${icon}`);
