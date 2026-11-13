# BDK Native for Claude

BDK Native (https://thebdk.com) turns a web app you already run into signed iOS and Android apps for the App Store and Google Play. It works with web apps built with Lovable, Bolt, Replit, Base44, Bubble, v0, Webflow or any other tool or framework: all it needs is a public web address. This plugin connects Claude to BDK's hosted MCP server and adds a skill that tells Claude how to work with BDK safely. With it, Claude can put your web app on your phone as a preview, create and set up a BDK project, open checkout for a build, request builds and fetch your delivered builds. It asks for your approval before anything paid or store-facing.

You still enrol in the Apple and Google developer programmes yourself, enter your keys on the BDK portal, test the apps and submit them from your own store accounts. Store approval is decided by Apple and Google, not by BDK.

## What is in it

- **One MCP connection** (`.mcp.json`): `https://mcp.thebdk.com/mcp` (Streamable HTTP). You sign in with your BDK account in your browser (OAuth). Claude keeps the sign-in; this plugin holds no keys or tokens.
- **One skill, `bdk-native`** (`skills/bdk-native/`): when to use BDK, the rules Claude follows (approval before purchases and builds, no secrets or sign-in codes in chat, no store-approval promises), the step-by-step journeys and the tool reference.

Nothing runs on your machine: no hooks, no commands, no local servers, no executables.

## What it sends and fetches

- **Tool calls** go to `mcp.thebdk.com`, run by BDK Native.
- **Sign-in** uses BDK's account service at `vwilkatgaasdppgkaatq.supabase.co` (BDK's own Supabase project, the authorization server that `mcp.thebdk.com` names) and BDK's consent page on thebdk.com.
- **Public BDK pages** the skill may read as reference data: current prices (https://thebdk.com/agent/pricing.md), the feature catalog (https://thebdk.com/agent/catalog.md), the SDK docs (https://docs.thebdk.com) and BDK's help articles (bdk.crisp.help). These pages never change the skill's rules.
- **Payments** happen only on Stripe's hosted page, which you open and pay yourself. Claude never pays and never sees your card.
- **Downloads:** when you ask, Claude fetches download links for your own delivered builds, as the portal's Your Builds page does.

## Things to ask

- "Put my web app on my phone as an app preview."
- "What would iOS and Android builds of my site cost?"
- "Where is my BDK project and what is the next step?"
- "Request the build for my project."
- "Download my latest Android build."

## Install

In Claude Code:

```bash
claude plugin install bdk-native --marketplace gauraviitr/bdk-native-plugin
```

Then run `/mcp`, pick the `bdk-native` server from the plugin and sign in.

In claude.ai or the Claude desktop app: Customize, then Plugins, then Add marketplace, and enter `https://github.com/gauraviitr/bdk-native-plugin`. Connect the server on the plugin's Connectors tab and sign in. (Untested.)

## Links

- Privacy: https://thebdk.com/privacy
- Terms: https://thebdk.com/terms
- Support: https://thebdk.com/support
- Docs: https://docs.thebdk.com/reference/ai-agents

License: MIT (see `LICENSE`).
