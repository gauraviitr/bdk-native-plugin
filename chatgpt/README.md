# ChatGPT plugin source: NOT SUBMITTED

> **Status: not submitted.** Nothing in this folder has been uploaded to platform.openai.com, connected in ChatGPT, or reviewed by OpenAI. It is the prepared source for a future upload.

`package/` is the plugin ZIP source in the portable Agent Plugins layout:

- `plugin.json`: manifest with the listing fields under `extensions["com.openai"]` (interface, publication and `review.commerce: false`).
- `mcp.json`: one server, `https://mcp.thebdk.com/mcp/preview` (Streamable HTTP). This preview-only endpoint must expose only preview tools, with no purchase, price or build tools and no commerce wording in its instructions or results. It is not the full `/mcp` endpoint the other hosts use.
- `skills/open-a-preview/SKILL.md`: a short skill that creates and lists previews and explains how to open them on a phone.
- `assets/icon.png`: same file as `../assets/icon.png`.

`review-details.json` sits **outside** `package/` and never goes into the ZIP. It holds the five positive and three negative test cases and the commerce description. The negative cases have to name the requests the plugin refuses, such as buying a build, so they cannot meet the no-commerce-wording rule for the package. Enter them in the dashboard's review form. The build script checks their shape and scans them for codes and secrets.

Listing rules this package follows (OpenAI plugin guidelines, read 2026-11-12): no prices, no checkout or purchase wording, no "free", no trial or upgrade wording, no sign-in or pairing codes, no `apps` / `.app.json`, no hooks, one MCP server, no secrets or reviewer credentials in the ZIP. The build script scans the full text of every file in `package/`, with no exemptions, and fails on any other file type. Its failure messages give the file, line and kind of problem, never the matched text.

## Build and check

```bash
node scripts/build-chatgpt-zip.mjs --check          # hard-rule checks only
node scripts/build-chatgpt-zip.mjs --out /some/dir   # checks, then writes bdk-native-chatgpt-<version>.zip there
```

Run from the repository root. Without `--out` the ZIP goes to the system temp folder. Keep built ZIPs out of the repository.

## Open before any upload

1. **The `/mcp/preview` endpoint** must be live, with its own protected-resource metadata. Confirm its tool names match `tools_triggered` in the five positive test cases in `review-details.json` (written for `bdk_setup_preview`).
2. **Developer identity.** `developerName` is set to the operator named on https://thebdk.com/terms. The directory shows the verified identity, which must match the terms and privacy pages. This is the founder's decision.
3. **Reviewer account** with a password (no emailed codes), one sample preview, a pre-created preview for `https://docs.thebdk.com` (positive case 3) and well under the 20-preview cap. Credentials go in the dashboard's secure form, never in this package.
4. **Demo video URL** (`demo_recording_url`): required for review, not set yet.
5. **Test cases in the dashboard.** OpenAI's submission page says review details are optional in the ZIP and must be present before submitting. It does not say whether test cases can be typed into the dashboard without a ZIP. Check this in the dashboard before upload.
6. **Domain verification** token at `/.well-known/openai-apps-challenge`, served as plain text.
7. Test as a custom MCP server in ChatGPT before submitting.

## Known review risks (recorded, not fixed here)

- The full `/mcp` endpoint keeps its 11 tools in one server; reads and writes are not split into separate tools or servers.
- The gateway does not check a token's audience (`resource`) or the request `Origin`.
- `/mcp/preview` is a presentation layer, not a security boundary: a token obtained through it is also accepted on `/mcp` and on the checkout tool.
- Fixed on 13 Nov 2026 (`2026-11-12-channels`): the full server's `instructions` no longer tell agents to load a remote guide as instructions (Directory Policy 2.F).
