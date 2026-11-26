import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";

export const targets = {
  "linux-x64": { os: "linux", arch: "x64", extension: ".tar.gz" },
  "windows-x64": { os: "win32", arch: "x64", extension: "-setup.exe" },
  "macos-arm64": { os: "darwin", arch: "arm64", extension: ".zip" },
};

export function releaseVersion(version) {
  if (typeof version !== "string" || !/^(0|[1-9][0-9]{0,3})(\.(0|[1-9][0-9]{0,3})){2}$/.test(version)
      || version.trim() !== version) {
    throw new Error("Expected an X.Y.Z version, with up to four digits per component");
  }
  return version;
}

export function artifactName(version, target) {
  return `DeepBot-${version}-${target}${targets[target].extension}`;
}

export function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: "inherit", windowsHide: true, ...options });
}

export function capture(command, args, options = {}) {
  return run(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...options }).trim();
}

export function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
