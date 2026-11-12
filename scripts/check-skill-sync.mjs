#!/usr/bin/env node
// Compares the BDK agent guide version stamped in this plugin's skill with the
// canonical guide's `skill_version`, and fails when they differ.
//
// Usage:
//   node scripts/check-skill-sync.mjs                         # reads https://thebdk.com/agent/skill.md
//   node scripts/check-skill-sync.mjs path/to/agent/skill.md  # reads a local copy (e.g. the portal repo)
//   node scripts/check-skill-sync.mjs <canonical> --skill path/to/SKILL.md
//
// Exit codes: 0 in sync, 1 out of sync, 2 a file or URL could not be read or parsed.
// Built-in Node modules only; maintainer tool, not loaded by any host.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CANONICAL = "https://thebdk.com/agent/skill.md";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(code, message) {
  console.error(`check-skill-sync: ${message}`);
  process.exit(code);
}

const args = process.argv.slice(2);
let canonical = DEFAULT_CANONICAL;
let skillPath = resolve(repoRoot, "skills/bdk-native/SKILL.md");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--skill") skillPath = resolve(args[++i] ?? "");
  else if (args[i] === "-h" || args[i] === "--help") {
    console.log("usage: node scripts/check-skill-sync.mjs [canonical-path-or-url] [--skill SKILL.md]");
    process.exit(0);
  } else canonical = args[i];
}

async function readCanonical(source) {
  if (/^https:\/\//.test(source)) {
    let res;
    try {
      res = await fetch(source, { signal: AbortSignal.timeout(15000), headers: { accept: "text/markdown, text/plain" } });
    } catch (err) {
      fail(2, `could not fetch ${source}: ${err.message}`);
    }
    if (!res.ok) fail(2, `could not fetch ${source}: HTTP ${res.status}`);
    return res.text();
  }
  if (/^http:\/\//.test(source)) fail(2, "refusing a plain http URL; use https or a local path");
  try {
    return await readFile(resolve(source), "utf8");
  } catch (err) {
    fail(2, `could not read ${source}: ${err.message}`);
  }
}

// Canonical guide: `skill_version: <value>` on its own line (in the body today).
function canonicalVersion(text) {
  const m = text.match(/^skill_version:\s*([A-Za-z0-9._-]+)\s*$/m);
  return m ? m[1] : null;
}

// Plugin skill: frontmatter `metadata.skill_version` and the body line "Guide version: `<value>`".
function pluginVersions(text) {
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) return { frontmatter: null, body: null };
  const metaBlock = fm[1].match(/^metadata:\n((?:[ \t]+.*\n?)*)/m);
  const metaVersion = metaBlock ? metaBlock[1].match(/^[ \t]+skill_version:\s*([A-Za-z0-9._-]+)\s*$/m) : null;
  const body = text.slice(fm[0].length);
  const bodyVersion = body.match(/^Guide version:\s*`([A-Za-z0-9._-]+)`/m);
  return { frontmatter: metaVersion ? metaVersion[1] : null, body: bodyVersion ? bodyVersion[1] : null };
}

const canonicalText = await readCanonical(canonical);
const want = canonicalVersion(canonicalText);
if (!want) fail(2, `no "skill_version:" line found in ${canonical}`);

let skillText;
try {
  skillText = await readFile(skillPath, "utf8");
} catch (err) {
  fail(2, `could not read ${skillPath}: ${err.message}`);
}
const have = pluginVersions(skillText);
if (!have.frontmatter) fail(2, `no metadata.skill_version in the frontmatter of ${skillPath}`);
if (!have.body) fail(2, `no "Guide version: \`...\`" line in the body of ${skillPath}`);

const problems = [];
if (have.frontmatter !== want) problems.push(`frontmatter metadata.skill_version is ${have.frontmatter}`);
if (have.body !== want) problems.push(`body "Guide version" is ${have.body}`);

if (problems.length) {
  console.error(`check-skill-sync: OUT OF SYNC with ${canonical} (skill_version ${want}):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("  Re-write the skill and its references from the new guide, update both stamps, bump the plugin version (see README, Releasing).");
  process.exit(1);
}
console.log(`check-skill-sync: in sync (skill_version ${want}, source ${canonical})`);
