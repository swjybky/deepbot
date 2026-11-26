import { appendFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run, sha256, targets } from "./common.mjs";

export const nshVersion = "0.4.0";
export const nodeVersion = "26.13.1";
const innoVersion = "6.7.3";
const nshUrl = `https://github.com/longbridge/nsh/releases/download/v${nshVersion}`;
const nodeUrl = `https://nodejs.org/dist/v${nodeVersion}`;

export const nativeTarget = Object.keys(targets).find((key) =>
  targets[key].os === process.platform && targets[key].arch === process.arch
);
const assets = {
  "linux-x64": {
    nsh: ["nsh-linux-x86_64.tar.gz", "8806121aebf40bb51f8fb6aa703722fbb01253f9a435759c18d53beece1ec976"],
    node: ["linux-x64.tar.xz", "5c063e46bab0fbc1c17cc445d7ff129cbdcd0471be6ed83b6ab864f8143bc864"],
  },
  "windows-x64": {
    nsh: ["nsh-windows-x86_64.zip", "e4cc3893700a1fcceb974c73ef8e08bc94a47a7a85c96d797d49c16dde95dff3"],
    node: ["win-x64.zip", "e2edda75bfb089654705cf65a13b58933bfd5f57148e8ebda916f58a2474f1f7"],
  },
  "macos-arm64": {
    nsh: ["nsh-macos-arm64.tar.gz", "f63c3d57c31b28c9b34227aac81f099d1e0e61f1db552a6ec5127d114eaf59cb"],
    node: ["darwin-arm64.tar.gz", "aec2514ea1ceb2ba52455e9ec65986f6749a06dd759e5db2a72e6889668c9735"],
  },
};

async function download(dir, url, name, expected) {
  const path = join(dir, name);
  run("curl", ["--fail", "--location", "--silent", "--show-error", "--retry", "3",
    "--output", path, `${url}/${name}`]);
  if (await sha256(path) !== expected) throw new Error(`Checksum mismatch for ${name}`);
  return path;
}

export async function unpackNode(dir) {
  const [suffix, digest] = assets[nativeTarget].node;
  const name = `node-v${nodeVersion}-${suffix}`;
  const archive = await download(dir, nodeUrl, name, digest);
  run("tar", ["-xf", archive, "-C", dir]);
  return join(dir, name.replace(/\.(tar\.xz|tar\.gz|zip)$/, ""));
}

// Extract the complete NSH distribution. The executable needs its sibling runtime files.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!nativeTarget) throw new Error(`Unsupported build host ${process.platform}/${process.arch}`);
  const dir = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "deepbot-toolchain-"));
  const archive = await download(dir, nshUrl, ...assets[nativeTarget].nsh);
  const nsh = join(dir, "nsh");
  mkdirSync(nsh);
  run("tar", ["-xf", archive, "--strip-components", "1", "-C", nsh]);
  const paths = [join(nsh, "bin")];
  if (nativeTarget === "windows-x64") {
    const installer = await download(dir, "https://github.com/jrsoftware/issrc/releases/download/is-6_7_3",
      `innosetup-${innoVersion}.exe`, "9c73c3bae7ed48d44112a0f48e66742c00090bdb5bef71d9d3c056c66e97b732");
    const inno = join(dir, "inno");
    run(installer, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", `/DIR=${inno}`], { timeout: 120_000 });
    paths.push(inno);
  }
  if (process.env.GITHUB_PATH) appendFileSync(process.env.GITHUB_PATH, paths.join("\n") + "\n");
  console.log(paths.join("\n"));
}
