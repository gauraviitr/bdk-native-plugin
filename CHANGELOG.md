# Changelog

## Records only (2026-11-17), no version change

- README and `chatgpt/README.md` state the current state: the Claude connector is published, the Claude plugin is submitted to Anthropic's plugin directory, and BDK Native for ChatGPT and Codex was submitted to OpenAI on 17 Nov 2026 and is in review. `chatgpt/` is marked as an earlier draft, not the submitted package.
- The draft in `chatgpt/` names the two tools the preview-only endpoint really has (`create_preview`, `list_previews`) instead of `bdk_setup_preview`.
- `chatgpt/README.md` records that a sign-in approved for `/mcp/preview` is limited to creating and listing previews since 17 Nov 2026.
- Nothing under `plugins/bdk-native/` changed; the plugin stays 1.0.5.

## 1.0.5 (2026-11-13)

- Follows BDK's agent guide `skill_version` `2026-11-13-wording`. That guide version changed no tool, rule or guidance (only the one-line description on the MCP Registry and the server card), so the skill text is unchanged apart from its two version stamps.

## 1.0.4 (2026-11-13)

- The Claude manifest states its four listing links (`documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl`). Without them the plugin directory took the links from the README and showed the pricing file as "Documentation".

## 1.0.3 (2026-11-13)

- The Claude plugin moved to its own folder, `plugins/bdk-native/`, holding only its manifest, listing icon, MCP config, the skill, a README and the licence. `.claude-plugin/marketplace.json` at the root points at it, so `claude plugin install bdk-native --marketplace gauraviitr/bdk-native-plugin` works as before. This is the plugin path for Anthropic's plugin directory.
- The skill has one copy, at `plugins/bdk-native/skills/bdk-native/`. Codex and Cursor point their `skills` at it; Codex reads the MCP config from the same folder; Gemini CLI loads the skill's `SKILL.md` through `contextFileName`, because it reads skills only from a root `skills/` folder.
- The Claude manifest keeps to the fields Claude Code's plugin spec knows: no `icon` field and no listing link fields. The icon sits at `.claude-plugin/icon.png`, where the directory finds it by itself; links to privacy, terms, support and docs are in the plugin README.
- The skill's `description` is quoted. The skill text is otherwise unchanged.
- `scripts/build-chatgpt-zip.mjs`: a list of manifest field names was renamed to `MANIFEST_FIELDS`. The ChatGPT package itself is unchanged and keeps its own version.
- `scripts/check-repo.mjs` checks the new layout: one skill copy, every host pointing at it, and nothing in the Claude plugin folder beyond what a Claude plugin needs (no scripts, no other images, no file naming an image or font). New cases in `scripts/test-checks.mjs`.

## 1.0.2 (2026-11-13)

- Descriptions, keywords and the skill's trigger text name the builders BDK is most often used with (Lovable, Bolt, Replit, Base44, Bubble and others). README status brought up to date.

## 1.0.1 (2026-11-13)

- Follows BDK's agent guide `skill_version` `2026-11-13-tools`: the MCP server has 11 tools and no `bdk_login` (the host signs in through its own flow), and `bdk_check` names the cases for `run: true`.

## 1.0.0 (2026-11-12)

- First version, written from BDK's agent guide `skill_version` `2026-11-06-sync`.
- Claude Code plugin and self-hosted marketplace (`thebdk`): the BDK Native MCP server (`https://mcp.thebdk.com/mcp`, OAuth) and the self-contained `bdk-native` skill with reference files for journeys, tools, configure fields, the readiness checklist and product facts.
- Codex plugin (`.codex-plugin/plugin.json`) and marketplace (`.agents/plugins/marketplace.json`).
- Cursor plugin manifest, rule and `mcp.json`; Gemini CLI extension (`gemini-extension.json`).
- ChatGPT plugin source in `chatgpt/` for the preview-only endpoint `https://mcp.thebdk.com/mcp/preview`, with a ZIP build-and-check script. Not submitted.
- Maintainer checks: `scripts/check-repo.mjs`, `scripts/check-skill-sync.mjs`, `scripts/build-chatgpt-zip.mjs`, with tests in `scripts/test-checks.mjs`.
- Check failures name the file, line and kind of problem, never the matched text.
- ChatGPT review test cases moved out of the ZIP to `chatgpt/review-details.json`; the ZIP check scans every packaged file in full. JSON files are scanned both as raw text and as decoded strings, so escapes such as a paragraph break cannot hide a word or a code.
