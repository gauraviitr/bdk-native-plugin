#!/usr/bin/env node
// Builds the ChatGPT plugin ZIP from chatgpt/package/ and checks the hard rules
// OpenAI documents for a public plugin ZIP (developers.openai.com/plugins, read
// 2026-11-12), plus BDK's own rules for this listing (no commerce wording, no
// codes, only the preview endpoint).
//
// Reviewer materials (test cases, commerce description) live in
// chatgpt/review-details.json, outside the package: they name refused requests,
// so they never ship in the ZIP. They are entered in the dashboard's review form.
// This script checks their shape and scans them for codes and secrets.
//
// Failure messages name the file, line and kind of problem only; they never
// print the matched text, so a planted code or secret never reaches a log.
//
// NOT SUBMITTED. Building the ZIP does not upload or submit anything.
//
// Usage:
//   node scripts/build-chatgpt-zip.mjs              # check, then write the ZIP to the system temp folder
//   node scripts/build-chatgpt-zip.mjs --check      # check only, write nothing
//   node scripts/build-chatgpt-zip.mjs --out DIR    # write the ZIP into DIR (keep it outside this repo)
//
// Exit codes: 0 pass, 1 a hard rule failed. Built-in Node modules only;
// maintainer tool, not loaded by any host.

import { readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(repoRoot, "chatgpt", "package");
const reviewFile = join(repoRoot, "chatgpt", "review-details.json");
const EXPECTED_MCP_URL = "https://mcp.thebdk.com/mcp/preview";
const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const CATEGORIES = [
  "Productivity", "Creativity", "Developer Tools", "Business & Operations", "Data & Analytics",
  "Communication", "Education & Research", "Security", "Finance", "Healthcare", "Travel",
  "Entertainment", "Other",
];

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? resolve(args[outIdx + 1] ?? "") : join(tmpdir(), "bdk-native-chatgpt");

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// Where a match sits, for messages that must not repeat the match itself.
const lineOf = (text, index) => text.slice(0, index).split("\n").length;
// A JSON.parse message can quote the source text; keep only its position.
const parseError = (e) => `does not parse as JSON${(e.message.match(/position \d+(?: \(line \d+ column \d+\))?/) ?? [""])[0].replace(/^./, (c) => ` at ${c}`)}`;
// A URL can carry a query, fragment or user:password; show origin and path only.
function safeUrl(u) {
  try { const x = new URL(String(u)); return `${x.origin}${x.pathname}`; } catch { return "a value that is not a URL"; }
}
// Every key and string value of parsed JSON, decoded. Raw JSON text hides word
// boundaries behind escapes (a "\n" before "Buy" reads as one word), so JSON is
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
// Raw text plus, for JSON, each decoded string with a label that names where it sits.
function textUnits(label, text) {
  const units = [[label, text]];
  if (/\.json$/i.test(label)) { try { for (const [p, s] of jsonStrings(JSON.parse(text))) units.push([`${label} at ${p}, line`, s]); } catch { /* reported by readJson */ } }
  return units;
}

// ---------- collect files ----------
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) { err(`symlink not allowed: ${relative(pkgDir, full)}`); continue; }
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
if (!existsSync(pkgDir)) { console.error(`missing ${pkgDir}`); process.exit(1); }
const files = walk(pkgDir);
const rel = files.map((f) => relative(pkgDir, f).split(sep).join("/"));

// ---------- ZIP-level hard rules ----------
for (const r of rel) {
  const base = r.split("/").pop();
  if ([".DS_Store", "Thumbs.db"].includes(base) || r.includes("__MACOSX")) err(`junk file in package: ${r}`);
  if (base === ".app.json") err(`app references are not allowed in a submitted ZIP: ${r}`);
  if (r.startsWith("hooks/") || base === "hooks.json") err(`lifecycle hooks are not allowed in a submitted ZIP: ${r}`);
  if (r.split("/").length > 20) err(`path has more than 20 segments: ${r}`);
}
if (rel.length > 5000) err(`more than 5,000 entries (${rel.length})`);
const totalBytes = files.reduce((n, f) => n + lstatSync(f).size, 0);
if (totalBytes > 512 * 1024 * 1024) err("extracted size over 512 MiB");

// ---------- JSON ----------
function readJson(r, base = pkgDir) {
  try { return JSON.parse(readFileSync(join(base, r), "utf8")); }
  catch (e) { err(`${r}: ${parseError(e)}`); return null; }
}
for (const r of rel.filter((x) => x.endsWith(".json"))) readJson(r);
const plugin = readJson("plugin.json") ?? {};
const mcp = readJson("mcp.json") ?? {};

// Agent Plugins plugin.schema.json 1.0.0 (additionalProperties: false).
const MANIFEST_FIELDS = ["$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"];
for (const k of Object.keys(plugin)) if (!MANIFEST_FIELDS.includes(k)) err(`plugin.json: unknown top-level key "${k}" (schema allows ${MANIFEST_FIELDS.join(", ")})`);
if (plugin.$schema !== PLUGIN_SCHEMA) err(`plugin.json: $schema must be ${PLUGIN_SCHEMA}`);
if (typeof plugin.name !== "string" || plugin.name.length > 64 || !/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(plugin.name)) err("plugin.json: name must be 1-64 lowercase letters, digits, single hyphens or dots");
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(plugin.version ?? "")) err("plugin.json: version must be an explicit semantic version");
if (plugin.description != null && (typeof plugin.description !== "string" || plugin.description.length > 4000)) err("plugin.json: description must be a string of at most 4000 characters");
if (plugin.author) for (const k of Object.keys(plugin.author)) if (!["name", "email", "url"].includes(k)) err(`plugin.json: unknown author key "${k}"`);
for (const [ns, v] of Object.entries(plugin.extensions ?? {})) if (typeof v !== "object" || v === null || Array.isArray(v)) err(`plugin.json: extensions["${ns}"] must be an object`);

const oai = plugin.extensions?.["com.openai"] ?? {};
const ui = oai.interface ?? {};
if (oai.apps !== undefined || plugin.apps !== undefined) err("app references (apps) are not allowed in a submitted ZIP");
if (oai.hooks !== undefined || plugin.hooks !== undefined) err("lifecycle hooks are not allowed in a submitted ZIP");

// Forbidden keys anywhere (secrets and reviewer data go in the dashboard form).
const FORBIDDEN_KEYS = ["clientSecret", "client_secret", "test_credentials", "reviewer_instructions", "password", "apiKey", "api_key", "token"];
function deepKeys(obj, path, fn) {
  if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) { fn(k, v, `${path}.${k}`); deepKeys(v, `${path}.${k}`, fn); }
}
for (const [name, obj] of [["plugin.json", plugin], ["mcp.json", mcp]]) {
  deepKeys(obj, name, (k, _v, p) => { if (FORBIDDEN_KEYS.includes(k)) err(`${p}: key "${k}" is not allowed in the ZIP`); });
}

// Listing metadata limits for public submission.
const lenMax = (field, max, required = true) => {
  const v = ui[field];
  if (v == null || v === "") { if (required) err(`interface.${field} is required`); return; }
  if (typeof v !== "string") return err(`interface.${field} must be a string`);
  if (v.length > max) err(`interface.${field} is ${v.length} characters (max ${max})`);
};
lenMax("displayName", 30);
lenMax("shortDescription", 30);
lenMax("longDescription", 4000);
lenMax("developerName", 80);
if (!CATEGORIES.includes(ui.category)) err(`interface.category must be one of: ${CATEGORIES.join(", ")}`);
if (ui.capabilities != null) {
  if (!Array.isArray(ui.capabilities) || ui.capabilities.length > 20) err("interface.capabilities: at most 20 strings");
  else ui.capabilities.forEach((c, i) => { if (typeof c !== "string" || c.length > 120) err(`interface.capabilities[${i}] over 120 characters`); });
}
for (const f of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
  const v = ui[f];
  if (typeof v !== "string" || !v.startsWith("https://") || v.length > 1024 || /\/\/[^/]*@/.test(v)) err(`interface.${f} must be an https URL (<=1024 characters, no embedded credentials)`);
}
const prompts = ui.defaultPrompt == null ? [] : Array.isArray(ui.defaultPrompt) ? ui.defaultPrompt : [ui.defaultPrompt];
if (prompts.length > 3) err("interface.defaultPrompt: at most 3 starter prompts");
if (new Set(prompts).size !== prompts.length) err("interface.defaultPrompt: prompts must be unique");
prompts.forEach((p, i) => {
  if (typeof p !== "string" || p.length > 128) err(`interface.defaultPrompt[${i}] over 128 characters`);
  if (/@/.test(p)) err(`interface.defaultPrompt[${i}] must not contain an @mention`);
});
for (const f of ["brandColor", "brandColorDark"]) if (ui[f] != null && !/^#[0-9A-Fa-f]{6}$/.test(ui[f])) err(`interface.${f} must be #RRGGBB`);

// Icons: ./ paths, included, square PNG/JPEG, 48..4096 px, <= 5 MiB.
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { type: "png", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { type: "jpeg", h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}
for (const f of ["logo", "composerIcon", "logoDark", "composerIconDark"]) {
  const v = ui[f];
  if (v == null) { if (f === "logo" || f === "composerIcon") err(`interface.${f} is required (primary icon)`); continue; }
  if (typeof v !== "string" || !v.startsWith("./")) { err(`interface.${f} must be a ./ relative path`); continue; }
  const r = v.slice(2);
  if (!rel.includes(r)) { err(`interface.${f} points at ${v}, which is not in the package`); continue; }
  const buf = readFileSync(join(pkgDir, r));
  if (buf.length > 5 * 1024 * 1024) err(`${v} is over 5 MiB`);
  const s = imageSize(buf);
  if (!s) err(`${v}: not a PNG or JPEG this check can read`);
  else {
    if (s.w !== s.h) err(`${v} is not square (${s.w}x${s.h})`);
    if (s.w < 48 || s.w > 4096) err(`${v} must be 48..4096 px (is ${s.w})`);
  }
}
const sharedIcon = join(repoRoot, "assets", "icon.png");
if (existsSync(sharedIcon) && rel.includes("assets/icon.png") && !readFileSync(sharedIcon).equals(readFileSync(join(pkgDir, "assets/icon.png")))) {
  warn("chatgpt/package/assets/icon.png differs from assets/icon.png");
}

if (oai.onboardingSkill != null) {
  const p = String(oai.onboardingSkill);
  if (!p.startsWith("./") || !rel.includes(p.slice(2))) err(`onboardingSkill ${p} must point at an included SKILL.md`);
}

// Review data. In the package: only the commerce flag (and, later, the demo URL).
// Test cases and the commerce description stay in chatgpt/review-details.json.
const review = oai.review ?? {};
for (const k of Object.keys(review)) if (!["commerce", "demo_recording_url"].includes(k)) err(`plugin.json: review.${k} belongs in chatgpt/review-details.json, not in the ZIP`);
if (review.commerce !== false) err("review.commerce must be false (this listing sells nothing)");
const details = existsSync(reviewFile) ? readJson("review-details.json", dirname(reviewFile)) ?? {} : (err("missing chatgpt/review-details.json (test cases for the review form)"), {});
for (const k of Object.keys(details)) if (!["test_cases", "commerce_description", "demo_recording_url"].includes(k)) err(`review-details.json: unknown key "${k}"`);
const tc = details.test_cases;
if (!tc) err("review-details.json: test_cases missing (initial MCP review needs exactly 5 positive and 3 negative cases)");
else {
  const pos = tc.positive ?? [];
  const neg = tc.negative ?? [];
  if (pos.length !== 5) err(`review-details.json: test_cases.positive has ${pos.length} cases (review needs exactly 5)`);
  if (neg.length !== 3) err(`review-details.json: test_cases.negative has ${neg.length} cases (review needs exactly 3)`);
  pos.forEach((c, i) => {
    for (const k of ["description", "prompt", "tools_triggered", "expected_behavior"]) if (typeof c[k] !== "string" || !c[k].trim()) err(`review-details.json: test_cases.positive[${i}].${k} is required`);
    if ((c.description ?? "").length > 4000) err(`review-details.json: test_cases.positive[${i}].description over 4000 characters`);
  });
  neg.forEach((c, i) => { for (const k of ["description", "prompt"]) if (typeof c[k] !== "string" || !c[k].trim()) err(`review-details.json: test_cases.negative[${i}].${k} is required`); });
}
if (typeof details.commerce_description !== "string" || !details.commerce_description.trim()) err("review-details.json: commerce_description is required");
if (review.demo_recording_url == null && details.demo_recording_url == null) warn("demo_recording_url not set: required before submitting for review (add it when a demo video exists)");
const pub = oai.publication ?? {};
if (pub.countries != null && (!Array.isArray(pub.countries) || pub.countries.some((c) => !/^[A-Z]{2}$/.test(c)))) err("publication.countries must be uppercase two-letter country codes");

// MCP config: Agent Plugins mcp.schema.json 1.0.0 and OpenAI's one-server rule.
for (const k of Object.keys(mcp)) if (!["$schema", "mcpServers"].includes(k)) err(`mcp.json: unknown top-level key "${k}"`);
if (mcp.$schema !== MCP_SCHEMA) err(`mcp.json: $schema must be ${MCP_SCHEMA}`);
const servers = Object.entries(mcp.mcpServers ?? {});
if (servers.length !== 1) err(`mcp.json: exactly one MCP server is allowed per plugin (found ${servers.length})`);
for (const [name, s] of servers) {
  for (const k of Object.keys(s)) if (!["type", "url", "headers"].includes(k)) err(`mcp.json: server "${name}" has key "${k}" that the streamable-http schema does not allow`);
  if (s.type !== "streamable-http") err(`mcp.json: server "${name}" type must be "streamable-http"`);
  if (s.url !== EXPECTED_MCP_URL) err(`mcp.json: server "${name}" url must be exactly ${EXPECTED_MCP_URL} (found ${s.url == null ? "none" : safeUrl(s.url)})`);
  if (s.headers && Object.keys(s.headers).length) err(`mcp.json: server "${name}" must not carry headers in a public submission`);
}

// Skills: frontmatter name matches folder, description present.
for (const r of rel.filter((x) => /^skills\/[^/]+\/SKILL\.md$/.test(x))) {
  const text = readFileSync(join(pkgDir, r), "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  const folder = r.split("/")[1];
  if (!fm) { err(`${r}: missing YAML frontmatter`); continue; }
  const name = fm[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const desc = fm[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (name !== folder) err(`${r}: frontmatter name must equal folder "${folder}"`);
  if (!desc) err(`${r}: frontmatter description is required`);
  else if (desc.length > 1024) err(`${r}: description over 1024 characters`);
  for (const k of fm[1].split("\n").map((l) => l.match(/^([A-Za-z_-]+):/)?.[1]).filter(Boolean)) {
    if (!["name", "description", "license", "compatibility", "metadata", "allowed-tools"].includes(k)) err(`${r}: frontmatter key "${k}" is not an Agent Skills field`);
  }
}

// ---------- BDK listing rules: no commerce wording, no other endpoints, no codes, no secrets ----------
// Scope: the raw text of every file that goes into the ZIP, with no exemptions. Reviewer materials that
// must name a refused request live outside the package (chatgpt/review-details.json).
const BANNED = ["free", "price", "prices", "pricing", "cost", "costs", "checkout", "buy", "purchase", "purchases", "pay", "paid", "payment", "payments", "stripe", "subscription", "subscriptions", "subscribe", "upgrade", "trial", "discount", "promo", "promotion", "coupon", "credit", "credits", "rebuild", "rebuilds", "refund", "cheap", "deal"];
const bannedRe = new RegExp(`\\b(${BANNED.join("|")})\\b`, "i");
function scanText(label, text) {
  const m = text.match(bannedRe);
  if (m) err(`${label}:${lineOf(text, m.index)}: commerce wording "${m[1].toLowerCase()}" is not allowed in this listing`);
  const a = text.match(/skill\.md|pricing\.md|llms\.txt/i);
  if (a) err(`${label}:${lineOf(text, a.index)}: must not reference BDK's agent files`);
  const f = text.match(/\band follow\b/i);
  if (f) err(`${label}:${lineOf(text, f.index)}: no fetch-and-follow instructions`);
  for (const u of text.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
    if (/mcp\.thebdk\.com/i.test(u[0]) && u[0] !== EXPECTED_MCP_URL) err(`${label}:${lineOf(text, u.index)}: points at ${safeUrl(u[0])}; only ${EXPECTED_MCP_URL} is allowed`);
    if (/^http:\/\//i.test(u[0])) err(`${label}:${lineOf(text, u.index)}: plain http URL (${safeUrl(u[0])})`);
  }
}
const TEXT_EXT = /\.(md|txt|json)$/i;
const IMAGE_EXT = /\.(png|jpe?g)$/i;
for (const r of rel) if (!TEXT_EXT.test(r) && !IMAGE_EXT.test(r)) err(`${r}: only .md, .txt, .json and PNG/JPEG files may ship (everything else would go unscanned)`);
for (const r of rel.filter((x) => TEXT_EXT.test(x))) for (const [label, t] of textUnits(r, readFileSync(join(pkgDir, r), "utf8"))) scanText(label, t);

// Codes and secrets, across every packaged text file and the review details kept outside the package.
const S = (...p) => p.join("");
const SECRET_PATTERNS = [
  [new RegExp(S("-----", "BEGIN [A-Z ]*PRIVATE KEY")), "private key"],
  [new RegExp(S("\\b(sk|rk|pk)_", "(live|test)_[0-9A-Za-z]{8,}")), "Stripe key"],
  [new RegExp(S("\\bgh[pousr]_", "[0-9A-Za-z]{20,}")), "GitHub token"],
  [new RegExp(S("\\bAKIA", "[0-9A-Z]{16}\\b")), "AWS key"],
  [new RegExp(S("\\beyJ", "[A-Za-z0-9_-]{15,}\\.[A-Za-z0-9_-]{15,}")), "JWT"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]{2,}/, "email address"],
  [/\b[2-9A-HJ-NP-Z]{4}[- ]?[2-9A-HJ-NP-Z]{4}\b/, "something shaped like a pairing code"],
  [/\b\d{6}\b/, "something shaped like an emailed sign-in code"],
];
const secretTargets = rel.filter((x) => TEXT_EXT.test(x)).map((r) => [r, join(pkgDir, r)]);
if (existsSync(reviewFile)) secretTargets.push(["../review-details.json", reviewFile]);
for (const [r, full] of secretTargets) {
  for (const [label, text] of textUnits(r, readFileSync(full, "utf8"))) {
    for (const [re, what] of SECRET_PATTERNS) { const m = text.match(re); if (m) err(`${label}:${lineOf(text, m.index)}: contains ${what} (text not shown)`); }
  }
}

// ---------- report checks ----------
for (const w of warnings) console.log(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  console.error(`build-chatgpt-zip: ${errors.length} hard-rule failure(s); no ZIP written.`);
  process.exit(1);
}
console.log(`build-chatgpt-zip: all hard-rule checks passed (${rel.length} files, ${warnings.length} warning(s)).`);
if (checkOnly) process.exit(0);

// ---------- write the ZIP (deflate, fixed timestamps, entries at the root) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01, fixed so builds are reproducible

const locals = [];
const centrals = [];
let offset = 0;
for (let i = 0; i < files.length; i++) {
  const name = Buffer.from(rel[i], "utf8");
  const data = readFileSync(files[i]);
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
  lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12); lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x031e, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
  ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
  ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
  ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE((0o100644 << 16) >>> 0, 38); ch.writeUInt32LE(offset, 42);
  locals.push(lh, name, comp);
  centrals.push(ch, name);
  offset += lh.length + name.length + comp.length;
}
const cdBuf = Buffer.concat(centrals);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...locals, cdBuf, eocd]);
if (zip.length > 100 * 1024 * 1024) { console.error("FAIL: ZIP over 100 MB compressed"); process.exit(1); }

// Read the ZIP back: every entry present once, at the root, and byte-identical after inflating.
function readBack(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const lo = buf.readUInt32LE(p + 42), compSize = buf.readUInt32LE(p + 20), crc = buf.readUInt32LE(p + 16);
    const dataStart = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
    const data = inflateRawSync(buf.subarray(dataStart, dataStart + compSize));
    if (crc32(data) !== crc) throw new Error(`CRC mismatch in ${name}`);
    entries.set(name, data);
    p += 46 + nameLen + extra + comment;
  }
  return entries;
}
const back = readBack(zip);
if (back.size !== rel.length || rel.some((r, i) => !back.has(r) || !back.get(r).equals(readFileSync(files[i])))) {
  console.error("FAIL: ZIP read-back does not match the package files"); process.exit(1);
}
if (!back.has("plugin.json") || !back.has("mcp.json")) { console.error("FAIL: plugin.json and mcp.json must sit at the ZIP root"); process.exit(1); }

if (resolve(outDir).startsWith(repoRoot + sep) && !resolve(outDir).startsWith(join(repoRoot, "dist"))) {
  console.error("FAIL: write the ZIP outside the repository (or into the git-ignored dist/)"); process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${plugin.name}-chatgpt-${plugin.version}.zip`);
writeFileSync(outFile, zip);
console.log(`build-chatgpt-zip: wrote ${outFile} (${zip.length} bytes, ${back.size} entries, read back OK). NOT SUBMITTED.`);
