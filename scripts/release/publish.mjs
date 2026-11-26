// This entry point runs only in the release job, after the three artifact checks.
import { strict as assert } from "node:assert";
import { appendFileSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { artifactName, capture, json, releaseVersion, sha256, targets } from "./common.mjs";

const version = releaseVersion(process.env.RELEASE_VERSION);
const tag = `v${version}`;
const commit = process.env.BUILD_COMMIT;
assert(/^[0-9a-f]{40}$/.test(commit), "Expected the resolved Git commit");
const repo = process.env.GITHUB_REPOSITORY;
assert(/^[\w.-]+\/[\w.-]+$/.test(repo), "Expected a GitHub repository");
const endpoint = `repos/${repo}`;
const incoming = resolve(process.argv[2] || "dist/incoming");
const work = mkdtempSync(join(tmpdir(), "deepbot-release-"));
const marker = `<!-- deepbot-release ${tag} ${commit} -->`;
const checksumFile = "SHA256SUMS";
const summaryFile = "build-summary.md";
const files = new Map();
const notes = [
  `# DeepBot ${version}`, "", `Source: \`${tag}\` at \`${commit}\``, "",
  "Each installer includes the desktop application, Node and the production Agent.",
  "The macOS app has an ad hoc signature and has not been notarized. The Windows installer is unsigned.",
  `See the [installation guide](https://github.com/${repo}/blob/${commit}/docs/release.md) for platform requirements.`, "",
];

assert.deepEqual(readdirSync(incoming).sort(), Object.keys(targets).sort());
for (const target of Object.keys(targets)) {
  const folder = join(incoming, target);
  const name = artifactName(version, target);
  assert.deepEqual(readdirSync(folder).sort(), [name, "build.json"].sort());
  const manifest = json(join(folder, "build.json"));
  assert.equal(manifest.version, version);
  assert.equal(manifest.commit, commit);
  assert.equal(manifest.target, target);
  assert.equal(manifest.name, name);
  assert(Array.isArray(manifest.checks) && manifest.checks.length > 0);
  const path = join(folder, name);
  const digest = await sha256(path);
  assert.equal(digest, manifest.sha256, `Invalid SHA-256 for ${name}`);
  files.set(name, { path, digest });
  notes.push(`## ${name}`, "", `Node ${manifest.node}, ${manifest.nsh}`, "",
    ...manifest.checks.map((check) => `- ${check}`), "");
}
const checksums = [...files].map(([name, { digest }]) => `${digest}  ${name}`).join("\n") + "\n";
const summary = notes.join("\n");
for (const [name, body] of [[checksumFile, checksums], [summaryFile, summary]]) {
  const path = join(work, name);
  writeFileSync(path, body);
  files.set(name, { path, digest: await sha256(path) });
}

function api(path, ...args) {
  const result = capture("gh", ["api", path, ...args]);
  return result ? JSON.parse(result) : undefined;
}

function update(path, method, data) {
  const input = join(work, "request.json");
  writeFileSync(input, JSON.stringify(data));
  return api(path, "--method", method, "--header", "Content-Type: application/json", "--input", input);
}

function assertTag() {
  let { object } = api(`${endpoint}/git/ref/tags/${tag}`);
  // GitHub returns a tag object for annotated tags and a commit for lightweight tags.
  for (let depth = 0; object.type === "tag" && depth < 10; depth++) {
    ({ object } = api(`${endpoint}/git/tags/${object.sha}`));
  }
  assert(object.type === "commit" && object.sha === commit, `${tag} no longer points to ${commit}`);
}

function listAssets(releasePath) {
  const assets = api(`${releasePath}/assets?per_page=100`, "--paginate", "--slurp").flat();
  assert(assets.every(({ name }) => files.has(name)), "Release contains an unexpected asset");
  assert.equal(new Set(assets.map(({ name }) => name)).size, assets.length, "Duplicate release assets");
  return assets;
}

function report(release, detail) {
  console.log(release.html_url);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${detail}\n[GitHub Release](${release.html_url})\n`);
  }
}

assertTag();
const matches = api(`${endpoint}/releases?per_page=100`, "--paginate", "--slurp").flat()
  .filter((item) => item.tag_name === tag);
assert(matches.length <= 1, `Multiple releases found for ${tag}`);
const body = `${marker}\n\n${summary}`;
const release = matches[0] ?? update(`${endpoint}/releases`, "POST", {
  tag_name: tag, target_commitish: commit, name: `DeepBot ${version}`, body, draft: true,
});
assert(release.body?.split("\n")[0] === marker, `Existing release for ${tag} belongs to a different source or was created outside this workflow`);
const releasePath = `${endpoint}/releases/${release.id}`;
const assets = listAssets(releasePath);

if (!release.draft) {
  // The previous attempt may have published successfully before its job stopped.
  assert.equal(assets.length, files.size, "Published release has missing assets");
  assert(assets.every((asset) => asset.state === "uploaded" && /^sha256:[0-9a-f]{64}$/.test(asset.digest)),
    "Published release has an incomplete asset");
  const detail = "Release already published. Existing assets were kept.";
  console.log(detail);
  report(release, detail);
} else {
  for (const [name, { path, digest }] of files) {
    const existing = assets.find((asset) => asset.name === name);
    if (existing?.state === "uploaded" && existing.digest === `sha256:${digest}`) continue;
    assert(api(releasePath).draft, "Release was published during upload");
    if (existing) api(`${endpoint}/releases/assets/${existing.id}`, "--method", "DELETE");
    const url = `https://uploads.github.com/${releasePath}/assets?name=${encodeURIComponent(name)}`;
    const uploaded = api(url, "--method", "POST", "--header", "Content-Type: application/octet-stream", "--input", path);
    assert(uploaded.name === name && uploaded.state === "uploaded" && uploaded.digest === `sha256:${digest}`,
      `GitHub returned an incomplete upload for ${name}`);
  }
  const uploaded = listAssets(releasePath);
  assert.equal(uploaded.length, files.size);
  assert(uploaded.every((asset) => asset.state === "uploaded" && asset.digest === `sha256:${files.get(asset.name).digest}`));
  assertTag();
  assert(api(releasePath).draft, "Release was published during upload");
  const published = update(releasePath, "PATCH", { body, draft: false });
  assert.equal(published.draft, false);
  report(published, summary);
}
