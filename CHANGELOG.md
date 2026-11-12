# Changelog

## 1.0.0 (2026-11-12)

- First version, written from BDK's agent guide `skill_version` `2026-11-06-sync`.
- Claude Code plugin and self-hosted marketplace (`thebdk`): the BDK Native MCP server (`https://mcp.thebdk.com/mcp`, OAuth) and the self-contained `bdk-native` skill with reference files for journeys, tools, configure fields, the readiness checklist and product facts.
- Codex plugin (`.codex-plugin/plugin.json`) and marketplace (`.agents/plugins/marketplace.json`).
- Cursor plugin manifest, rule and `mcp.json`; Gemini CLI extension (`gemini-extension.json`).
- ChatGPT plugin source in `chatgpt/` for the preview-only endpoint `https://mcp.thebdk.com/mcp/preview`, with a ZIP build-and-check script. Not submitted.
- Maintainer checks: `scripts/check-repo.mjs`, `scripts/check-skill-sync.mjs`, `scripts/build-chatgpt-zip.mjs`, with tests in `scripts/test-checks.mjs`.
- Check failures name the file, line and kind of problem, never the matched text.
- ChatGPT review test cases moved out of the ZIP to `chatgpt/review-details.json`; the ZIP check scans every packaged file in full. JSON files are scanned both as raw text and as decoded strings, so escapes such as a paragraph break cannot hide a word or a code.
