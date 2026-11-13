#!/usr/bin/env node
// Repository consistency checks for every host manifest in this repo.
//
//   node scripts/check-repo.mjs
//
// Checks: every JSON file parses; the four host manifests share one name and
// version; every full-plugin MCP config points at the same URL; every host
// finds the one canonical skill in plugins/bdk-native/skills/; the Claude
// plugin folder holds only what a Claude plugin needs (no scripts, no images,
// nothing that names an image or font file, no manifest fields outside the
// plugin spec), because that folder is what Anthropic's plugin directory
// scans; the skill frontmatter matches its folder, quotes its description and
// stays within the documented size guidance; no price, secret, personal email,
// code-shaped string or fetch-and-follow instruction anywhere in the tree.
// Failure messages name the file, line and kind of problem only; they never
// print the matched text, so a planted code or secret never reaches a log.
// Exit codes: 0 pass, 1 a check failed. Built-in Node modules only;
// maintainer tool, not loaded by any host.

import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MCP_URL = "https://mcp.thebdk.com/mcp";
// The Claude plugin lives in its own folder; the marketplace at the repo root
// points at it, and the Codex, Cursor and Gemini manifests reach into it for
// the skill. This folder is the plugin path given to Anthropic's directory.
const CLAUDE_DIR = "plugins/bdk-native";
const CLAUDE_MANIFEST = `${CLAUDE_DIR}/.claude-plugin/plugin.json`;
const CLAUDE_MCP = `${CLAUDE_DIR}/.mcp.json`;
const SKILLS_DIR = `${CLAUDE_DIR}/skills`;
const SKILL_FILE = `${SKILLS_DIR}/bdk-native/SKILL.md`;
const errors = [];
const err = (m) => errors.push(m);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === ".git" || name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) err(`symlink: ${relative(root, full)}`);
    else if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
const files = walk(root).map((f) => relative(root, f).split(sep).join("/"));
const text = (r) => readFileSync(join(root, r), "utf8");
const lineOf = (t, index) => t.slice(0, index).split("\n").length;
// A JSON.parse message can quote the source text; keep only its position.
const parseError = (e) => `does not parse as JSON${(e.message.match(/position \d+(?: \(line \d+ column \d+\))?/) ?? [""])[0].replace(/^./, (c) => ` at ${c}`)}`;
// A URL can carry a query, fragment or user:password; show origin and path only.
function safeUrl(u) {
  if (u == null) return "none";
  try { const x = new URL(String(u)); return `${x.origin}${x.pathname}`; } catch { return "a value that is not a URL"; }
}
// Every key and string value of parsed JSON, decoded. Raw JSON text hides word
// boundaries behind escapes (a "\n" before a code reads as one word), so JSON is
// scanned both raw and decoded. A key is named in a path only when it looks safe.
function jsonStrings(v, path = "", out = []) {
  if (typeof v === "string") out.push([path || "(root)", v]);
  else if (Array.isArray(v)) v.forEach((x, i) => jsonStrings(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
    const name = /^[A-Za-z_$][\w$.-]{0,40}$/.test(k) && !/\d/.test(k) ? k : "(key not shown)";
    out.push([`${path}.${name} (key)`, k]);
    jsonStrings(x, `${path}.${name}`, out);
  }
  return out;
}

for (const r of files) {
  const base = r.split("/").pop();
  if ([".DS_Store", "Thumbs.db"].includes(base) || r.includes("__MACOSX")) err(`junk file: ${r}`);
  const size = lstatSync(join(root, r)).size;
  if (!/\.(png|jpe?g)$/i.test(r) && size > 256 * 1024) err(`${r} is over 256 KiB`);
  if (/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/.test(r)) err(`lockfile not wanted (directory review hold): ${r}`);
}

// 1. Every JSON file parses.
const json = {};
for (const r of files.filter((x) => x.endsWith(".json"))) {
  try { json[r] = JSON.parse(text(r)); } catch (e) { err(`${r}: ${parseError(e)}`); }
}

// 2. Host manifests agree.
const MANIFESTS = [CLAUDE_MANIFEST, ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json", "gemini-extension.json"];
const versions = new Set();
for (const m of MANIFESTS) {
  const j = json[m];
  if (!j) { err(`missing ${m}`); continue; }
  if (j.name !== "bdk-native") err(`${m}: name must be "bdk-native"`);
  if (!/^\d+\.\d+\.\d+$/.test(j.version ?? "")) err(`${m}: version must be x.y.z`);
  versions.add(j.version);
}
if (versions.size > 1) err(`host manifest versions differ: ${[...versions].map((v) => (/^\d+\.\d+\.\d+$/.test(v ?? "") ? v : "(invalid)")).join(", ")} (bump them together)`);
const cm = json[".claude-plugin/marketplace.json"];
const xm = json[".agents/plugins/marketplace.json"];
if (cm?.name !== "thebdk" || xm?.name !== "thebdk") err('both marketplaces must be named "thebdk"');
if (cm?.plugins?.[0]?.source !== `./${CLAUDE_DIR}`) err(`.claude-plugin/marketplace.json: source must be "./${CLAUDE_DIR}"`);
if (cm?.plugins?.[0]?.version !== undefined) err(".claude-plugin/marketplace.json: leave version to plugin.json");
const xe = xm?.plugins?.[0];
if (xe?.source?.path !== "./" || !xe?.policy?.installation || !xe?.policy?.authentication || !xe?.category) err(".agents/plugins/marketplace.json: entry needs source.path ./, policy.installation, policy.authentication and category");
if (json[".codex-plugin/plugin.json"]?.mcpServers !== `./${CLAUDE_MCP}` || json[".codex-plugin/plugin.json"]?.skills !== `./${SKILLS_DIR}/`) err(`.codex-plugin/plugin.json: skills must be "./${SKILLS_DIR}/" and mcpServers "./${CLAUDE_MCP}"`);
if (json[".cursor-plugin/plugin.json"]?.skills !== `./${SKILLS_DIR}/`) err(`.cursor-plugin/plugin.json: skills must be "./${SKILLS_DIR}/"`);
if (json["gemini-extension.json"]?.contextFileName !== SKILL_FILE) err(`gemini-extension.json: contextFileName must be "${SKILL_FILE}" (Gemini CLI reads skills only from its root skills/ folder)`);
if (files.includes("plugin.json")) err("no root plugin.json: OpenAI would read it as a portable package and ignore .codex-plugin/plugin.json");

// 2b. The Claude plugin folder: the only Claude plugin, and only what it needs.
if (files.includes(".claude-plugin/plugin.json")) err(".claude-plugin/plugin.json: the Claude manifest lives in plugins/bdk-native/; the repo root holds only the marketplace");
if (files.includes(".mcp.json")) err(".mcp.json: the Claude MCP config lives in plugins/bdk-native/ (one copy)");
const skillCopies = files.filter((x) => /(^|\/)SKILL\.md$/.test(x) && !x.startsWith("chatgpt/"));
if (skillCopies.length !== 1 || skillCopies[0] !== SKILL_FILE) err(`one canonical skill expected at ${SKILL_FILE} (found ${skillCopies.length} SKILL.md files outside chatgpt/)`);
// .claude-plugin/icon.png is the listing icon. The directory finds it at that
// path by itself, so no file names it (naming an image is what raised its holds).
const CLAUDE_ICON = ".claude-plugin/icon.png";
const CLAUDE_FILES = [/^\.claude-plugin\/plugin\.json$/, /^\.claude-plugin\/icon\.png$/, /^\.mcp\.json$/, /^README\.md$/, /^LICENSE$/, /^skills\/[a-z0-9-]+\/(SKILL\.md|references\/[a-z0-9-]+\.md)$/];
const claudeFiles = files.filter((x) => x.startsWith(`${CLAUDE_DIR}/`)).map((x) => x.slice(CLAUDE_DIR.length + 1));
for (const r of claudeFiles) if (!CLAUDE_FILES.some((re) => re.test(r))) err(`${CLAUDE_DIR}/${r}: not allowed in the Claude plugin folder (only .claude-plugin/plugin.json, .claude-plugin/icon.png, .mcp.json, README.md, LICENSE and skills/*/ Markdown)`);
const MEDIA_NAME = /\.(png|jpe?g|gif|svg|webp|ico|icns|bmp|tiff?|avif|heic|ttf|otf|woff2?|eot)\b/i;
for (const r of claudeFiles.filter((x) => x !== CLAUDE_ICON && CLAUDE_FILES.some((re) => re.test(x)))) {
  const t = text(`${CLAUDE_DIR}/${r}`);
  const m = t.match(MEDIA_NAME);
  if (m) err(`${CLAUDE_DIR}/${r}:${lineOf(t, m.index)}: names an image or font file (the plugin directory holds a plugin that does)`);
}
if (files.includes(`${CLAUDE_DIR}/LICENSE`) && files.includes("LICENSE") && text(`${CLAUDE_DIR}/LICENSE`) !== text("LICENSE")) err(`${CLAUDE_DIR}/LICENSE must be the same as LICENSE`);
if (files.includes(`${CLAUDE_DIR}/${CLAUDE_ICON}`) && !readFileSync(join(root, CLAUDE_DIR, CLAUDE_ICON)).equals(readFileSync(join(root, "assets", "icon.png")))) err(`${CLAUDE_DIR}/${CLAUDE_ICON} must be the same file as the shared icon in assets/`);
// The icon is optional: deleting it (if the directory ever holds it) must not fail this check.
for (const r of ["README.md", "LICENSE"]) if (!files.includes(`${CLAUDE_DIR}/${r}`)) err(`missing ${CLAUDE_DIR}/${r}`);
// Fields the Claude Code plugin manifest spec knows, minus the directory
// listing fields (icon, documentationUrl, supportUrl, privacyPolicyUrl,
// termsOfServiceUrl) that the directory's checker reported as warnings.
const CLAUDE_FIELDS = ["$schema", "name", "displayName", "version", "description", "author", "homepage", "repository", "license", "keywords"];
for (const k of Object.keys(json[CLAUDE_MANIFEST] ?? {})) if (!CLAUDE_FIELDS.includes(k)) err(`${CLAUDE_MANIFEST}: field "${/^[A-Za-z$][\w$]{0,40}$/.test(k) ? k : "(not shown)"}" is not allowed (keep to ${CLAUDE_FIELDS.join(", ")})`);

// 3. One MCP URL for the full plugin (the ChatGPT package has its own, checked by build-chatgpt-zip.mjs).
const urlOf = {
  [CLAUDE_MCP]: json[CLAUDE_MCP]?.mcpServers?.["bdk-native"]?.url,
  "mcp.json": json["mcp.json"]?.mcpServers?.["bdk-native"]?.url,
  "gemini-extension.json": json["gemini-extension.json"]?.mcpServers?.["bdk-native"]?.httpUrl,
};
for (const [f, u] of Object.entries(urlOf)) if (u !== MCP_URL) err(`${f}: bdk-native server must be ${MCP_URL} (found ${safeUrl(u)})`);
if (json[CLAUDE_MCP]?.mcpServers?.["bdk-native"]?.type !== "http") err(`${CLAUDE_MCP}: type must be "http"`);
for (const f of [CLAUDE_MCP, "mcp.json"]) {
  const servers = Object.values(json[f]?.mcpServers ?? {});
  if (servers.length !== 1) err(`${f}: exactly one server expected`);
  for (const s of servers) if (s.headers || s.env) err(`${f}: no headers or env (OAuth is discovered from the server)`);
}

// 4. Skill shape.
const skillFiles = files.filter((x) => x.startsWith(`${SKILLS_DIR}/`) && /^[^/]+\/SKILL\.md$/.test(x.slice(SKILLS_DIR.length + 1)));
if (skillFiles.length === 0) err(`no skill found under ${SKILLS_DIR}/`);
for (const r of skillFiles) {
  const t = text(r);
  const fm = t.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) { err(`${r}: no frontmatter`); continue; }
  const folder = r.slice(SKILLS_DIR.length + 1).split("/")[0];
  if (fm[1].match(/^name:\s*(.+)$/m)?.[1].trim() !== folder) err(`${r}: name must equal folder "${folder}"`);
  const rawDesc = fm[1].match(/^description:\s*(.+)$/m)?.[1].trim() ?? "";
  // Quoted, so no YAML reader can take a colon or a hash in it for structure.
  const quoted = rawDesc.match(/^"([^"\\]*)"$/);
  if (!quoted) err(`${r}: description must be a double-quoted string with no quote or backslash inside`);
  const desc = quoted ? quoted[1] : rawDesc;
  if (!desc || desc.length > 1024) err(`${r}: description must be 1-1024 characters (is ${desc.length})`);
  if (/[<>]/.test(desc)) err(`${r}: no angle brackets in description`);
  for (const k of fm[1].split("\n").map((l) => l.match(/^([A-Za-z_-]+):/)?.[1]).filter(Boolean)) {
    if (!["name", "description", "license", "compatibility", "metadata", "allowed-tools"].includes(k)) err(`${r}: frontmatter key "${k}" is not an Agent Skills field`);
  }
  const bodyLines = t.slice(fm[0].length).split("\n").length;
  if (bodyLines >= 500) err(`${r}: body is ${bodyLines} lines (keep under 500; move detail to references/)`);
  for (const link of t.matchAll(/\]\((references\/[^)]+)\)/g)) if (!files.includes(`${SKILLS_DIR}/${folder}/${link[1]}`)) err(`${r}: broken link ${link[1]}`);
}

// 5. Content scans over every text file (patterns are assembled so this file does not match itself).
const S = (...p) => p.join("");
const SCANS = [
  [new RegExp(S("\\$", "\\s?\\d")), "a price"],
  [new RegExp(S("U", "S\\$|\\bU", "SD\\b|€\\s?\\d|£\\s?\\d|₹\\s?\\d")), "a price"],
  [new RegExp(S("\\b\\d+(\\.\\d+)?\\s?(dol", "lars|ce", "nts)\\b"), "i"), "a price"],
  [new RegExp(S("-----", "BEGIN [A-Z ]*PRIVATE KEY")), "a private key"],
  [new RegExp(S("\\b(sk|rk|pk)_", "(live|test)_[0-9A-Za-z]{8,}")), "a Stripe key"],
  [new RegExp(S("\\bgh[pousr]_", "[0-9A-Za-z]{20,}|github_", "pat_")), "a GitHub token"],
  [new RegExp(S("\\bAKIA", "[0-9A-Z]{16}\\b")), "an AWS key"],
  [new RegExp(S("\\beyJ", "[A-Za-z0-9_-]{15,}\\.[A-Za-z0-9_-]{15,}")), "a JWT"],
  [new RegExp(S("[A-Za-z0-9._%+-]+", "@", "[A-Za-z0-9-]+\\.[A-Za-z0-9.-]*[A-Za-z]{2,}")), "an email address"],
  [new RegExp(S("bixby", "\\.tech|@gm", "ail")), "a personal contact"],
  [/\b[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}\b/, "something shaped like a pairing code"],
  [new RegExp(S("\\band ", "follow\\b"), "i"), "a fetch-and-follow instruction"],
  [new RegExp(S("\\bre-?", "fetch\\b"), "i"), "a fetch-again instruction"],
];
for (const r of files.filter((x) => /\.(md|mdc|json|mjs|txt|toml|ya?ml)$/i.test(x) || !x.includes(".") || x.endsWith("LICENSE"))) {
  const raw = text(r);
  const units = [[r, raw]];
  if (r.endsWith(".json") && json[r] !== undefined) for (const [p, s] of jsonStrings(json[r])) units.push([`${r} at ${p}, line`, s]);
  for (const [label, t] of units) {
    for (const [re, what] of SCANS) {
      const m = t.match(re);
      if (m) err(`${label}:${lineOf(t, m.index)}: contains ${what} (text not shown)`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  console.error(`check-repo: ${errors.length} failure(s).`);
  process.exit(1);
}
console.log(`check-repo: all checks passed (${files.length} files, ${Object.keys(json).length} JSON files parsed).`);
