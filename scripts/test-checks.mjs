#!/usr/bin/env node
// Tests for the maintainer checks. Each case copies the repository (without
// .git) to a temporary folder, plants a problem, runs the copied script and
// checks its exit code and output.
//
//   node --test scripts/test-checks.mjs
//
// Planted codes are assembled at run time so this file never contains a
// code-shaped string itself (check-repo.mjs scans it). Built-in Node modules
// only; maintainer tool, not loaded by any host.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const S = (...p) => p.join("");
// Synthetic values only: never a real code.
const PAIRING = S("K7QM", "-", "X4RT");
const SIGNIN = S("482", "913");
const SKIP = new Set([".git", "node_modules", "dist"]);

function copyRepo(t) {
  const dir = mkdtempSync(join(tmpdir(), "bdk-native-plugin-test-"));
  cpSync(repoRoot, dir, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function run(dir, script, ...args) {
  const r = spawnSync(process.execPath, [join(dir, "scripts", script), ...args], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}
function assertNotShown(out, ...values) {
  for (const v of values) {
    assert.ok(!out.includes(v), "output repeats a planted value");
    for (const half of v.split("-")) if (half.length >= 4) assert.ok(!out.includes(half), "output repeats part of a planted value");
  }
}
const SKILL = "chatgpt/package/skills/open-a-preview/SKILL.md";
const CLAUDE_MANIFEST = "plugins/bdk-native/.claude-plugin/plugin.json";
const CLAUDE_SKILL = "plugins/bdk-native/skills/bdk-native/SKILL.md";

test("a clean copy passes both checks", (t) => {
  const dir = copyRepo(t);
  assert.equal(run(dir, "check-repo.mjs").code, 0);
  assert.equal(run(dir, "build-chatgpt-zip.mjs", "--check").code, 0);
});

test("planted codes fail both checks without being printed", (t) => {
  const dir = copyRepo(t);
  appendFileSync(join(dir, SKILL), `\nYour code is ${PAIRING} and ${SIGNIN}.\n`);
  const repo = run(dir, "check-repo.mjs");
  assert.equal(repo.code, 1);
  assert.match(repo.out, /SKILL\.md:\d+: contains something shaped like a pairing code/);
  assertNotShown(repo.out, PAIRING, SIGNIN);
  const zip = run(dir, "build-chatgpt-zip.mjs", "--check");
  assert.equal(zip.code, 1);
  assert.match(zip.out, /pairing code/);
  assert.match(zip.out, /emailed sign-in code/);
  assertNotShown(zip.out, PAIRING, SIGNIN);
});

test("a code inside broken JSON is not printed by the parse error", (t) => {
  const dir = copyRepo(t);
  writeFileSync(join(dir, "chatgpt/package/plugin.json"), `{"name": ${PAIRING}}`);
  const repo = run(dir, "check-repo.mjs");
  assert.equal(repo.code, 1);
  assert.match(repo.out, /plugin\.json: does not parse as JSON/);
  assertNotShown(repo.out, PAIRING);
  const zip = run(dir, "build-chatgpt-zip.mjs", "--check");
  assert.equal(zip.code, 1);
  assertNotShown(zip.out, PAIRING);
});

test("a code in a URL query is not printed by the URL checks", (t) => {
  const dir = copyRepo(t);
  appendFileSync(join(dir, SKILL), `\nOpen http://mcp.thebdk.com/mcp?pair=${PAIRING.replace("-", "")}\n`);
  const zip = run(dir, "build-chatgpt-zip.mjs", "--check");
  assert.equal(zip.code, 1);
  assert.match(zip.out, /only https:\/\/mcp\.thebdk\.com\/mcp\/preview is allowed/);
  assert.match(zip.out, /plain http URL/);
  assertNotShown(zip.out, PAIRING.replace("-", ""), PAIRING);

  const dir2 = copyRepo(t);
  const f = join(dir2, "plugins/bdk-native/.mcp.json");
  const j = JSON.parse(readFileSync(f, "utf8"));
  j.mcpServers["bdk-native"].url = `https://mcp.thebdk.com/mcp?pair=${PAIRING}`;
  writeFileSync(f, JSON.stringify(j));
  const repo = run(dir2, "check-repo.mjs");
  assert.equal(repo.code, 1);
  assert.match(repo.out, /\.mcp\.json: bdk-native server must be/);
  assertNotShown(repo.out, PAIRING);
});

test("commerce wording anywhere in the packaged manifest fails, including review fields", (t) => {
  const dir = copyRepo(t);
  const f = join(dir, "chatgpt/package/plugin.json");
  const j = JSON.parse(readFileSync(f, "utf8"));
  const details = JSON.parse(readFileSync(join(dir, "chatgpt/review-details.json"), "utf8"));
  Object.assign(j.extensions["com.openai"].review, details);
  writeFileSync(f, JSON.stringify(j, null, 2));
  const zip = run(dir, "build-chatgpt-zip.mjs", "--check");
  assert.equal(zip.code, 1);
  assert.match(zip.out, /plugin\.json:\d+: commerce wording/);
  assert.match(zip.out, /review\.test_cases belongs in chatgpt\/review-details\.json/);
});

test("the shipped package keeps only the commerce flag under review", () => {
  const j = JSON.parse(readFileSync(join(repoRoot, "chatgpt/package/plugin.json"), "utf8"));
  const review = j.extensions["com.openai"].review ?? {};
  assert.equal(review.test_cases, undefined);
  assert.equal(review.commerce_description, undefined);
  assert.equal(review.commerce, false);
});

test("review details outside the package may name the refused request, but are shape-checked", (t) => {
  const dir = copyRepo(t);
  const f = join(dir, "chatgpt/review-details.json");
  const details = JSON.parse(readFileSync(f, "utf8"));
  assert.match(JSON.stringify(details), /\bBuy\b/);
  assert.equal(run(dir, "build-chatgpt-zip.mjs", "--check").code, 0);
  details.test_cases.negative.pop();
  writeFileSync(f, JSON.stringify(details, null, 2));
  const zip = run(dir, "build-chatgpt-zip.mjs", "--check");
  assert.equal(zip.code, 1);
  assert.match(zip.out, /test_cases\.negative has 2 cases/);
});

test("review details are scanned for codes without printing them", (t) => {
  const dir = copyRepo(t);
  const f = join(dir, "chatgpt/review-details.json");
  const details = JSON.parse(readFileSync(f, "utf8"));
  details.test_cases.negative[1].prompt = `Use code ${PAIRING}.`;
  writeFileSync(f, JSON.stringify(details, null, 2));
  const zip = run(dir, "build-chatgpt-zip.mjs", "--check");
  assert.equal(zip.code, 1);
  assert.match(zip.out, /review-details\.json:\d+: contains something shaped like a pairing code \(text not shown\)/);
  assertNotShown(zip.out, PAIRING);
});

test("a file type the scanner cannot read may not ship", (t) => {
  const dir = copyRepo(t);
  writeFileSync(join(dir, "chatgpt/package/notes.html"), "<p>hello</p>\n");
  const zip = run(dir, "build-chatgpt-zip.mjs", "--check");
  assert.equal(zip.code, 1);
  assert.match(zip.out, /notes\.html: only \.md, \.txt, \.json and PNG\/JPEG files may ship/);
});

test("a paragraph break in a JSON string does not hide a banned word or a code", (t) => {
  // In raw JSON a new paragraph is a backslash and "n", so a word right after it has no word boundary.
  const dir = copyRepo(t);
  const f = join(dir, "chatgpt/package/plugin.json");
  const j = JSON.parse(readFileSync(f, "utf8"));
  j.extensions["com.openai"].interface.longDescription += `\n\nBuy one.\n${PAIRING.replace("-", "")}`;
  writeFileSync(f, JSON.stringify(j, null, 2));
  const zip = run(dir, "build-chatgpt-zip.mjs", "--check");
  assert.equal(zip.code, 1);
  assert.match(zip.out, /plugin\.json at \.extensions\.com\.openai\.interface\.longDescription, line:\d+: commerce wording "buy"/);
  assert.match(zip.out, /longDescription, line:\d+: contains something shaped like a pairing code \(text not shown\)/);
  assertNotShown(zip.out, PAIRING.replace("-", ""), PAIRING);

  const dir2 = copyRepo(t);
  const g = join(dir2, CLAUDE_MANIFEST);
  const k = JSON.parse(readFileSync(g, "utf8"));
  k.description += `\n${PAIRING}`;
  writeFileSync(g, JSON.stringify(k, null, 2));
  const repo = run(dir2, "check-repo.mjs");
  assert.equal(repo.code, 1);
  assert.match(repo.out, /plugins\/bdk-native\/\.claude-plugin\/plugin\.json at \.description, line:\d+: contains something shaped like a pairing code \(text not shown\)/);
  assertNotShown(repo.out, PAIRING);
});

// The Claude plugin folder is what Anthropic's plugin directory scans. These
// cases keep the causes of its policy holds and warnings out of that folder.

test("a script, an image or an image reference in the Claude plugin folder fails", (t) => {
  for (const [rel, body, want] of [
    ["plugins/bdk-native/scripts/tool.mjs", "export {};\n", /plugins\/bdk-native\/scripts\/tool\.mjs: not allowed in the Claude plugin folder/],
    ["plugins/bdk-native/logo.png", "", /plugins\/bdk-native\/logo\.png: not allowed in the Claude plugin folder/],
  ]) {
    const dir = copyRepo(t);
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
    const repo = run(dir, "check-repo.mjs");
    assert.equal(repo.code, 1);
    assert.match(repo.out, want);
  }
  const dir = copyRepo(t);
  appendFileSync(join(dir, "plugins/bdk-native/README.md"), "\nSee assets/icon.png.\n");
  const repo = run(dir, "check-repo.mjs");
  assert.equal(repo.code, 1);
  assert.match(repo.out, /plugins\/bdk-native\/README\.md:\d+: names an image or font file/);
});

test("the Claude manifest keeps to the fields the plugin spec and the directory know, without an icon field", (t) => {
  const dir = copyRepo(t);
  const f = join(dir, CLAUDE_MANIFEST);
  const j = JSON.parse(readFileSync(f, "utf8"));
  j.icon = "./icon";
  writeFileSync(f, JSON.stringify(j, null, 2));
  const repo = run(dir, "check-repo.mjs");
  assert.equal(repo.code, 1);
  assert.match(repo.out, /plugin\.json: field "icon" is not allowed/);
});

test("a second copy of the skill at the repo root fails", (t) => {
  const dir = copyRepo(t);
  cpSync(join(dir, "plugins/bdk-native/skills"), join(dir, "skills"), { recursive: true });
  const repo = run(dir, "check-repo.mjs");
  assert.equal(repo.code, 1);
  assert.match(repo.out, /one canonical skill/);
});

test("an unquoted skill description fails", (t) => {
  const dir = copyRepo(t);
  const f = join(dir, CLAUDE_SKILL);
  writeFileSync(f, readFileSync(f, "utf8").replace(/^description: "(.*)"$/m, (_m, d) => `description: ${d}`));
  const repo = run(dir, "check-repo.mjs");
  assert.equal(repo.code, 1);
  assert.match(repo.out, /description must be a double-quoted string/);
});

test("a host path that no longer points at the skill fails", (t) => {
  const dir = copyRepo(t);
  const f = join(dir, "gemini-extension.json");
  const j = JSON.parse(readFileSync(f, "utf8"));
  j.contextFileName = "skills/bdk-native/SKILL.md";
  writeFileSync(f, JSON.stringify(j, null, 2));
  const repo = run(dir, "check-repo.mjs");
  assert.equal(repo.code, 1);
  assert.match(repo.out, /gemini-extension\.json: contextFileName must be/);
});
