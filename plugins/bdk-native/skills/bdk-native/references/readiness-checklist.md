# Readiness checklist

Read-only. Search tracked source only: skip `node_modules`, `dist`, `.next`, build output, vendored code, tests and fixtures. If the repo holds several apps, ask which one is being wrapped. Decide for every hit whether it is on a live path or in test, example or dead code before reporting it.

If a hit contains a key, token, password or private key, cite only the file, line and variable name. Never quote the value. Tell the customer to rotate a committed secret.

**Result labels (closed set):** `Observed` · `Not found in searched paths` (name the paths; absence of evidence is not proof) · `Needs manual/native test` · `Not applicable`.

**Per finding:** what I found (`file:line`) → why it matters in a wrapped app → one concrete fix → confidence (high / med / low).

| # | Check | Look for | Why it matters in the app |
|---|---|---|---|
| 1 | Sign-in inside a web view | `signInWithPopup`, `signInWithOAuth`, `accounts.google.com/o/oauth2`, Auth0 or next-auth social providers on user-facing routes | Google refuses OAuth inside embedded web views (`disallowed_useragent`). Fix: hand sign-in to the system browser (the SDK's external sign-in), or use magic links or one-time codes. |
| 2 | Account deletion | A delete-account route or action the user can reach | Apple requires in-app account deletion if the app creates accounts. Missing it is a common rejection pattern, never "you will be rejected". Not applicable without accounts. |
| 3 | Icon source | Manifest icons, `apple-touch-icon`, logo files of 1024 px or more | The app icon needs a real 1024 px image; a scaled-up favicon looks poor on a home screen. |
| 4 | Viewport and safe areas | `viewport-fit=cover`, `env(safe-area-inset-*)`, `100vh` with fixed headers or footers | Content under the notch or home indicator is the most visible "feels like a website" bug. |
| 5 | Mixed content | `http://` assets or APIs on production paths | Blocked in the app's web view; images and calls silently break. Ignore localhost and staging. |
| 6 | New-window patterns | `window.open`, `target="_blank"`, `<a download>` in sign-in, payment or download flows | May do nothing in the app unless routed through the SDK's link helpers. Ignore ordinary external links. |
| 7 | Staying signed in | localStorage vs cookie auth, `SameSite` / `Secure`, third-party-cookie embeds | "Logged out every launch" is the most common support issue. Code rarely proves it; flag it for a preview test. |
| 8 | Hard-coded origins | `localhost`, `*.vercel.app`, staging URLs in runtime code | Tied to the launch URL. The launch URL can change after the build without a rebuild. |
| 9 | Password gate | Basic auth, hosting protection, a login wall at `/` | The preview will show the wall; the customer can set preview credentials on the portal. Ask rather than trust static HTML. |
| 10 | Web-only UI | "Add to home screen" banners, `beforeinstallprompt`, "Download our app", cookie walls | Odd inside the app; easy to hide when running native (the SDK can tell). |
| 11 | Native-feature evidence | `getUserMedia`, `capture=`, geolocation, QR libraries, `navigator.share`, existing OneSignal or FCM | Not defects: evidence for feature mapping and permission-message drafts. |
| 12 | Digital-goods sales | Subscriptions, credits or courses sold through web checkout and used in the app | Digital goods used in the app generally must use the store's purchase system (Apple's and Google's rule, not BDK's; BDK has in-app purchase flows but the customer sets up store products). Physical goods and real-world services are fine. Neutral observation only. |
| 13 | Deep-link routes | Router tree with meaningful parameter routes | Gives concrete deep-link examples for the feature mapping. |
| 14 | Push readiness | User accounts and somewhere to store a device id | Decides whether per-user push is realistic now or broadcast-only until a backend exists. |

## Don't flag these

- A library in `package.json` with no import on a user-facing route.
- Hits in `/admin`, `/studio`, tests or examples.
- Google APIs used for Maps, YouTube or server auth (not Google sign-in in a web view). `signInWithRedirect` is not automatically safe either: what matters is whether sign-in leaves the web view.
- Stripe Checkout in a new tab (payments are not OAuth; Stripe for physical goods and services is fine).
- "Deactivate", newsletter unsubscribe or a Stripe cancel is not account deletion; a `deleteUser` helper used only in tests isn't either.
- A missing PWA manifest. BDK doesn't need one; it is only a handy source for icon, name and colour defaults.
- CSP, `X-Frame-Options` or `frame-ancestors`. The app is not an iframe; these don't block it.

A clean run is still not a verdict: say "nothing on the checklist turned up", then the disclosure block. Never say "none blocking".

## Feature mapping

BDK's capability catalog (https://thebdk.com/agent/catalog.md) is reference data for which native features exist and what each needs. Match features to evidence in this app; never invent a feature. Suggest at most five to seven ideas in the customer's own words, mark which parts are built in and which are code they'd write, never turn "your code" into "included", and end with the disclosure block.
