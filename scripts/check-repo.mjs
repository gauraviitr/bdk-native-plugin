#!/usr/bin/env node
// Repository consistency checks for every host manifest in this repo.
//
//   node scripts/check-repo.mjs
//
// Checks: every JSON file parses; the four host manifests share one name and
// version; every full-plugin MCP config points at the same URL; the skill
// frontmatter matches its folder and stays within the documented size
// guidance; no price, secret, personal email, code-shaped string or
// fetch-and-follow instruction anywhere in the tree.
// Failure messages name the file, line and kind of problem only; they never
// print the matched text, so a planted code or secret never reaches a log.
// Exit codes: 0 pass, 1 a check failed. Built-in Node modules only;
// maintainer tool, not loaded by any host.

import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MCP_URL = "https://mcp.thebdk.com/mcp";
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
const MANIFESTS = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json", "gemini-extension.json"];
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
if (cm?.plugins?.[0]?.source !== "./") err('.claude-plugin/marketplace.json: source must be "./"');
if (cm?.plugins?.[0]?.version !== undefined) err(".claude-plugin/marketplace.json: leave version to plugin.json");
const xe = xm?.plugins?.[0];
if (xe?.source?.path !== "./" || !xe?.policy?.installation || !xe?.policy?.authentication || !xe?.category) err(".agents/plugins/marketplace.json: entry needs source.path ./, policy.installation, policy.authentication and category");
if (json[".codex-plugin/plugin.json"]?.mcpServers !== "./.mcp.json" || json[".codex-plugin/plugin.json"]?.skills !== "./skills/") err(".codex-plugin/plugin.json: skills and mcpServers paths");
if (files.includes("plugin.json")) err("no root plugin.json: OpenAI would read it as a portable package and ignore .codex-plugin/plugin.json");

// 3. One MCP URL for the full plugin (the ChatGPT package has its own, checked by build-chatgpt-zip.mjs).
const urlOf = {
  ".mcp.json": json[".mcp.json"]?.mcpServers?.["bdk-native"]?.url,
  "mcp.json": json["mcp.json"]?.mcpServers?.["bdk-native"]?.url,
  "gemini-extension.json": json["gemini-extension.json"]?.mcpServers?.["bdk-native"]?.httpUrl,
};
for (const [f, u] of Object.entries(urlOf)) if (u !== MCP_URL) err(`${f}: bdk-native server must be ${MCP_URL} (found ${safeUrl(u)})`);
if (json[".mcp.json"]?.mcpServers?.["bdk-native"]?.type !== "http") err('.mcp.json: type must be "http"');
for (const f of [".mcp.json", "mcp.json"]) {
  const servers = Object.values(json[f]?.mcpServers ?? {});
  if (servers.length !== 1) err(`${f}: exactly one server expected`);
  for (const s of servers) if (s.headers || s.env) err(`${f}: no headers or env (OAuth is discovered from the server)`);
}

// 4. Skill shape.
for (const r of files.filter((x) => /^skills\/[^/]+\/SKILL\.md$/.test(x))) {
  const t = text(r);
  const fm = t.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) { err(`${r}: no frontmatter`); continue; }
  const folder = r.split("/")[1];
  if (fm[1].match(/^name:\s*(.+)$/m)?.[1].trim() !== folder) err(`${r}: name must equal folder "${folder}"`);
  const desc = fm[1].match(/^description:\s*(.+)$/m)?.[1].trim() ?? "";
  if (!desc || desc.length > 1024) err(`${r}: description must be 1-1024 characters (is ${desc.length})`);
  if (/[<>]/.test(desc)) err(`${r}: no angle brackets in description`);
  for (const k of fm[1].split("\n").map((l) => l.match(/^([A-Za-z_-]+):/)?.[1]).filter(Boolean)) {
    if (!["name", "description", "license", "compatibility", "metadata", "allowed-tools"].includes(k)) err(`${r}: frontmatter key "${k}" is not an Agent Skills field`);
  }
  const bodyLines = t.slice(fm[0].length).split("\n").length;
  if (bodyLines >= 500) err(`${r}: body is ${bodyLines} lines (keep under 500; move detail to references/)`);
  for (const link of t.matchAll(/\]\((references\/[^)]+)\)/g)) if (!files.includes(`skills/${folder}/${link[1]}`)) err(`${r}: broken link ${link[1]}`);
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
