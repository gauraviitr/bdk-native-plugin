# ChatGPT plugin: earlier draft of the package

> **Status on 17 November 2026: BDK Native for ChatGPT and Codex is submitted to OpenAI and in review. It is not published yet.** The submitted package was built from a newer source that BDK keeps outside this repository. This folder is the earlier draft of that package, kept for its build checks. It is not what was uploaded: do not upload it.

`package/` is the draft plugin ZIP source in the portable Agent Plugins layout:

- `plugin.json`: manifest with the listing fields under `extensions["com.openai"]` (interface, publication and `review.commerce: false`).
- `mcp.json`: one server, `https://mcp.thebdk.com/mcp/preview` (Streamable HTTP). This preview-only endpoint exposes two tools, `create_preview` and `list_previews`, with no purchase, price or build tools and no commerce wording in its instructions or results. It is not the full `/mcp` endpoint the other hosts use.
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

## State on 17 November 2026

This list was "open before any upload" until the submission. What happened to each point:

1. **The `/mcp/preview` endpoint** is live with its own protected-resource metadata and exactly two tools, `create_preview` and `list_previews`. The test cases in `review-details.json` name those tools.
2. **Developer identity.** OpenAI verified the operator named on https://thebdk.com/terms as a business.
3. **Reviewer account.** A password-only test account with sample previews is used. Its sign-in details are only in OpenAI's review form, never in a package or in this repository.
4. **Demo video.** Recorded and given to OpenAI with the submission.
5. **Test cases.** The portal reads them from the uploaded ZIP and shows them read-only in its review form. This draft keeps them outside the ZIP, which is one reason it is not the submitted package.
6. **Domain verification.** Done: the server answers OpenAI's check at `/.well-known/openai-apps-challenge` as plain text.
7. **Connection test.** Run as a custom MCP server in ChatGPT, then connected in OpenAI's portal, which found both tools and reported no findings.

Still open: OpenAI's review, and publishing after approval.

## Known review risks

- The full `/mcp` endpoint keeps its 11 tools in one server; reads and writes are not split into separate tools or servers.
- Fixed on 17 Nov 2026: a sign-in approved for `/mcp/preview` is limited to creating and listing previews. The limit is recorded for that user and client when the sign-in is approved, and the gateway checks it on every request: the same connection is refused on `/mcp`, on the other tools (checkout included) and on device approval. Until then `/mcp/preview` was a presentation layer only.
- The gateway does not read a token's audience (`resource`) or the request `Origin`; the limit above is a recorded grant, not an audience check.
- Fixed on 13 Nov 2026 (`2026-11-12-channels`): the full server's `instructions` no longer tell agents to load a remote guide as instructions (Directory Policy 2.F).
