# BDK Native plugin

BDK Native (https://thebdk.com) turns a web app you already run into signed iOS and Android apps for the App Store and Google Play. It works with web apps built with Lovable, Bolt, Replit, Base44, Bubble, v0, Webflow or any other tool or framework: all it needs is a public web address. This repository connects your AI assistant to BDK's hosted MCP server and adds a skill that tells the assistant how to work with BDK safely. With it, your assistant can put your web app on your phone as a preview, create and set up a BDK project, open checkout for a build, request builds and fetch your delivered builds. It asks for your approval before anything paid or store-facing.

You still enrol in the Apple and Google developer programmes yourself, enter your keys on the BDK portal, test the apps and submit them from your own store accounts. Store approval is decided by Apple and Google, not by BDK.

## Status

- The BDK Native MCP server (11 tools) has been run end to end in **Claude Code**, in **Claude** on the web (claude.ai) and in **ChatGPT** (13 November 2026).
- Installing this plugin from this repository has been tried in Claude Code. The install lines for the other hosts follow each host's own documentation and have not been tried.
- Codex, Cursor, Gemini CLI and VS Code are untested.
- The ChatGPT version in `chatgpt/` is **not submitted**.

## What is in it

- **One MCP connection:** `https://mcp.thebdk.com/mcp` (Streamable HTTP). You sign in with your BDK account in your browser (OAuth). The host keeps the sign-in; this repository holds no keys or tokens.
- **One skill, `bdk-native`:** when to use BDK, the rules the assistant follows (approval before purchases and builds, no secrets or sign-in codes in chat, no store-approval promises), the step-by-step journeys and the tool reference.
- **Host manifests** for Claude, Codex, Cursor and Gemini CLI, all pointing at the same server and the same skill.

Nothing runs on your machine: no hooks, no local servers, no scripts. The `scripts/` folder holds maintainer tools that no host loads.

## What it sends and fetches

- **Tool calls** go to `mcp.thebdk.com`, run by BDK Native. Sign-in uses BDK's sign-in and consent pages on thebdk.com.
- **Public BDK pages** the skill may read as reference data: current prices (https://thebdk.com/agent/pricing.md), the feature catalog (https://thebdk.com/agent/catalog.md), the SDK docs (https://docs.thebdk.com) and BDK's help articles (bdk.crisp.help). These pages never change the skill's rules.
- **Payments** happen only on Stripe's hosted page, which you open and pay yourself. The assistant never pays and never sees your card.
- **Downloads:** when you ask, the assistant fetches download links for your own delivered builds, as the portal's Your Builds page does.

## Things to ask

- "Put my web app on my phone as an app preview."
- "What would iOS and Android builds of my site cost?"
- "Where is my BDK project and what is the next step?"
- "Request the build for my project."
- "Download my latest Android build."

## Install

The repository is `gauraviitr/bdk-native-plugin`. Each command below names it once.

### Claude Code

```bash
claude plugin install bdk-native --marketplace gauraviitr/bdk-native-plugin
```

Or, inside a Claude Code session:

```text
/plugin install bdk-native --marketplace gauraviitr/bdk-native-plugin
```

Then run `/mcp`, pick the `bdk-native` server from the plugin and sign in.

To add only the server, without the skill:

```bash
claude mcp add --transport http bdk-native https://mcp.thebdk.com/mcp
```

### claude.ai and the Claude desktop app

Customize → Plugins → Add → Add marketplace, then enter:

```text
https://github.com/gauraviitr/bdk-native-plugin
```

Connect the server on the plugin's Connectors tab and sign in. (Untested.)

### Codex CLI

```bash
codex plugin marketplace add gauraviitr/bdk-native-plugin
codex plugin add bdk-native@thebdk
```

To add only the server:

```bash
codex mcp add bdk-native --url https://mcp.thebdk.com/mcp
codex mcp login bdk-native
```

### Gemini CLI

```bash
gemini extensions install https://github.com/gauraviitr/bdk-native-plugin
```

Then, inside Gemini CLI, run `/mcp auth bdk-native` to sign in. The extension adds the server and the `bdk-native` skill.

### Cursor

This plugin is not listed in the Cursor Marketplace yet. To add the server by hand, put this in `~/.cursor/mcp.json` (it is the same as `mcp.json` in this repository):

```json
{ "mcpServers": { "bdk-native": { "url": "https://mcp.thebdk.com/mcp" } } }
```

### VS Code

```bash
code --add-mcp '{"name":"bdk-native","type":"http","url":"https://mcp.thebdk.com/mcp"}'
```

### Other MCP clients

Use the server URL `https://mcp.thebdk.com/mcp` with Streamable HTTP and OAuth sign-in. Field names differ by client: most take `"url"` (some also `"type": "http"`); Gemini CLI's `settings.json` takes `"httpUrl"`; Cline needs `"type": "streamableHttp"`.

## Repository layout

| Path | Read by |
|---|---|
| `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json` | Claude Code, claude.ai, Claude desktop |
| `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `.mcp.json` | Codex |
| `.cursor-plugin/plugin.json`, `rules/bdk-native.mdc`, `mcp.json` | Cursor |
| `gemini-extension.json` | Gemini CLI |
| `skills/bdk-native/` | the shared skill (Claude, Codex, Cursor, Gemini CLI) |
| `assets/icon.png` | listing icon |
| `chatgpt/` | source of the ChatGPT plugin ZIP, preview-only, **not submitted** |
| `scripts/` | maintainer checks; no host loads them |

## For maintainers

The skill is written from BDK's canonical agent guide (https://thebdk.com/agent/skill.md, source `apps/portal/public/agent/skill.md` in the BDK web repo) in its own words. It carries the guide's rules and workflow itself and never tells the model to load and obey a remote file (Anthropic Software Directory Policy 2.F). It never states a price; prices come from `bdk_estimate` or pricing.md at run time.

Checks (Node 22, built-in modules only):

```bash
node scripts/check-repo.mjs                  # JSON parses, manifests agree, no prices/secrets/codes
node scripts/check-skill-sync.mjs            # skill stamp vs the live canonical skill_version
node scripts/check-skill-sync.mjs ../bdk-native-web/apps/portal/public/agent/skill.md   # or a local copy
node scripts/build-chatgpt-zip.mjs --check   # ChatGPT ZIP hard rules, writes nothing
node --test scripts/test-checks.mjs          # tests for the two checks above
claude plugin validate . --strict --profile directory
gemini extensions validate .
```

### Releasing

Do this whenever the canonical guide's `skill_version` changes (`check-skill-sync.mjs` fails until it is done), and for any other change to the plugin:

1. Re-read the canonical guide and update `skills/bdk-native/SKILL.md` and its `references/` in their own words. Keep the rules self-contained: no instructions to load remote rules, no prices, no codes, no secrets.
2. Set the new value in both stamps in `SKILL.md`: `metadata.skill_version` in the frontmatter and the `Guide version:` line in the body.
3. Raise `version` together in `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json` and `gemini-extension.json`. Add a `CHANGELOG.md` entry.
4. Run every check above; all must pass.
5. Commit, then tag with `claude plugin tag` (it checks that the manifest and marketplace entry agree).

The ChatGPT package in `chatgpt/` has its own version and review cycle; see `chatgpt/README.md`.

## Links

Privacy: https://thebdk.com/privacy (see also `PRIVACY.md`) · Terms: https://thebdk.com/terms · Support: https://thebdk.com/support · Docs: https://docs.thebdk.com

License: MIT (see `LICENSE`).
