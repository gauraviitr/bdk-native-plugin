# BDK Native tools

The MCP server exposes these tools with a `bdk_` prefix. Arguments are JSON. Errors come back as `{error, error_description?, fix?}`. Every tool can also return `invalid_token` (sign in again through the host), `slow_down` (429, wait `Retry-After`) and a general server error.

When a tool call fails in transit, the result holds `error: "upstream_timeout"` or `"upstream_error"`, `outcome: "unknown"`, `current_state` (may be null) and `fix`. Check state and Purchases before retrying anything that changes data.

## bdk_whoami

- Args: `{}`. Call first after connecting.
- 200: `{user:{id,email}, projects:[{project_code, app_name, status, product_selected, commerce_authority, status_note}]}`.
- Extra error: `upstream_error`.

## bdk_projects

- Args: `{project_code?}`. Lists projects, or reads one project's status, guide progress and health snapshot.
- Not a full settings readback, and not the source for purchases. For purchases and rebuilds read `next.commerce`. Don't infer entitlement from `status`, `paid_for_service`, `requested_build`, `build_complete`, `rebuild_credits` or `free_rebuild_expires_at`; on ledger projects these are null with a `commerce_authority_note`.
- 200: `{projects:[...]}` or `{project:{...}}`.
- Extra errors: `project_not_found`, `upstream_error`.

## bdk_next (the loop driver)

- Args: `{project_code?, confirm_product?}`. With no code: 0 projects gives `needs_project`, 1 gives that project, several give `choose_project`.
- `schema_version` is `bdk_next.v3`.
- 200 includes `schema_version`, `skill_version`, `project_code`, `app_name`, `state`, `state_version`, `milestones`, `progress`, `next`, `allowed_tools`, `can_request_now`, `blocking_holds`, `recent_activity`, `portal_url`, check data, `commerce` (when relevant), `projects` (for selection) and `sitting_brief` (in the `portal_sitting` state).
- `state` and `next` drive the work. `milestones` is a progress summary; status is `complete`, `pending` or `unknown`, and unknown is not complete. The preview milestone does not prove phone testing.
- `confirm_product`: send the customer's iOS / Android / Both answer here, then read `bdk_next` again and check it matches before `bdk_estimate` or `bdk_checkout`. After purchase a platform change can return `action_not_allowed` (409); don't loop.
- `can_request_now` is a recommendation. If false, follow `next` first. If true, a request can still be refused; relay it.
- `allowed_tools` is advisory, not consent and not a full list.
- `next.commerce` carries `available_build`, `available_rebuild`, `can_request_build`, `can_request_rebuild`, `active_request_id`, `delivered`, `on_hold` and `next_expiry`.
- `blocking_holds[].instructions` explains a hold. `health_checked_at` says how fresh health data is.
- Extra errors: `invalid_request`, `project_code_required`, `project_not_found`, `upstream_error`, `action_not_allowed`.

## bdk_create_project

- Direct: `{project_name, website_link, duplicate_choice?, project_code?}`. `project_name` (up to 120 characters) is a reference label. The app name starts as the site's hostname until changed with `bdk_configure` `app_name`.
- Duplicates by label or site host return `project_choice_required` (409, with `candidates`). The customer picks `duplicate_choice: "create_new"` or `"use_existing"` with a candidate `project_code`. Never pick for them.
- From a preview: `{from_preview_id}` returns `{prefill, choice_required: true, instructions}`. After approval send `{from_preview_id, observed_website_link, project_name, website_link, link_existing?, project_code?}`, keeping `observed_website_link` from the prefill. For `same_site_project`, ask whether to link (`link_existing: true` with `project_code`) or create separately (`link_existing: false`).
- 200: `{project_code, created: true, ...}`, or `{project_code, created: false, selected_existing: true}`.
- Errors: `invalid_request`, `link_not_published` (400, with `kind` and `suggestion`), `project_choice_required`, preview-create conflicts, `upstream_error` (502).

## bdk_configure

- Args: `{project_code, fields: {...}}`. Field list and values: configure-fields.md.
- 200: `{applied, refused, failed, actions_run}`. Refused keys carry `reason` and `fix`; failed keys carry `reason` and `message`.
- `partial_failure` (502) returns the same per-key results when some writes were not confirmed. Keep what was `applied` and review `failed` before retrying. A later error can come after earlier fields were saved; don't report that nothing changed.
- Extra errors: `project_code_required`, `invalid_request`, `project_not_found`, `upstream_error`.

## bdk_upload

- Image: `{project_code, source_url, filename?, kind?, purpose?}`. Fetches a public HTTPS image, up to 8 MB, no redirects.
  - `purpose: "app_icon"` checks a 1024×1024 PNG or JPEG with no transparency or animation.
  - No purpose, or `purpose: "image"`, checks a general PNG, JPEG or WebP.
  - 200: `{ref, icon_validated, width, height, note}`.
  - Uploading an image does not assign it to a screen.
- Credential hand-off: `{project_code, kind: "credential", credential: "asc_api_key" | "apns_key" | "firebase_service_account" | "onesignal_org_key" | "android_keystore"}`. 200: `{kind, credential, upload_url, instructions, detection}`. Give the portal URL and instructions to the customer. Never ask for the value in chat.
- Errors: `project_code_required`, `invalid_request`, `project_not_found`, `ssrf_blocked`, `payload_too_large`, `upstream_error`; image errors (415) `not_an_image`, `invalid_icon_format`, `invalid_icon_dimensions`, `invalid_icon_alpha`; download errors (400) `fetch_timeout`, `fetch_failed`, `fetch_http_error`, `bad_tls`, `redirect_not_allowed`.

## bdk_setup_preview

- `{intent: "list"}`, `{intent: "new", app_link, name?}`, or `{intent: "update", app_link, preview_id}`.
- List 200: `{previews: [{preview_id, name, published_url, created}]}`. New/update 200: `{ok, preview_id, reused?, install_link, instructions}`.
- Password protection and preview credentials (including clearing them) are portal-only; don't send those fields.
- Errors: `preview_intent_required` (400), `invalid_request` (400), `portal_only_protection` (400), `preview_row_missing` (404, with `previews`: ask the customer to pick an existing preview, create one, or check the ID), `link_not_published` (400, with `kind` and `suggestion`), `preview_cap_reached` (`cap: 20`), `upstream_error` (502).

## bdk_estimate

- Args: `{project_code?, product?}`. Prefer `project_code` for current offers; project access is checked first.
- Ledger 200: `{project_code, commerce, offers, pricing_note, payment_note}`. Each offer's `unit_amount` is in minor units of `currency`; convert and state the currency.
- Product-only 200: `{product, price_usd, price_cents, rebuild_usd, includes, timeline_note, payment_note}`: standard prices, not project eligibility.
- Errors: `product_required` (400), `legacy_project` (400), `project_not_found` (404), `upstream_error` (502). A failed project lookup is not permission to quote a standard price instead.
- Never contains a payment link.

## bdk_checkout

- Start: `{project_code, action: "start", kind: "build" | "rebuild", attempt, promotion_code?, confirm_extra_rebuild?}`.
  - `confirm_extra_rebuild: true` only when the customer explicitly asks to buy an extra despite an unused rebuild or an active request.
  - Any `confirm_add_platform` returns `add_platform_unavailable` (409); send the customer to portal support.
  - Use an explicit unique `attempt` per purchase intent; the default can collide with an older purchase. Don't change `attempt` blindly after an unclear error.
- Start 200: `{authority, purchase_id, session_id, status, session_status, fulfilled, url, kind, offer, paid, resumed, quote?, payment_note, next_step}`. `url` is null for an already-paid purchase; check `status` and `next_step` before sharing a URL, and don't pay twice. `quote` has `currency, subtotal_minor, discount_minor, total_minor`.
- Poll: `{project_code, action: "poll", purchase_id}` returns `{status, fulfilled, purchase_id, next}`. `status` is `quoted`, `open`, `paid`, `expired` or `disputed`. Only `fulfilled: true` makes it usable. `paid` and not fulfilled: read again later. `disputed`: portal support chat. Paying does not request a build.
- Errors: `project_code_required`, `invalid_request`, `project_not_found`, `action_not_allowed` (409), `offer_unavailable` (409), `promo_invalid` (409), `purchase_not_found` (404), `upstream_error`. Other refusals (409): `product_unconfirmed`, `already_entitled`, `rebuild_not_ready`, `add_platform_unavailable`, `checkout_unknown`, `purchase_disputed`, `payment_pending`, `checkout_expired` (an unreadable replay may give `checkout_unknown` with 502). Reconcile the same purchase before another attempt.

## bdk_build

- Args: `{project_code, action: "request" | "status" | "download", build_kind?, confirm_build?, confirm_consumes_rebuild?}`.
- First build: after explicit approval of the request and the final saved settings, send `confirm_build: true`; otherwise `build_unconfirmed` (409).
- Ledger rebuild: `build_kind: "rebuild"` and `confirm_consumes_rebuild: true`. No `free_rebuild` on ledger projects.
- Request 200 includes `{ok, action, build_kind, patched_fields}`; other metadata in it is not customer copy.
- Status 200: `{project_code, builds}`: delivered history, not the current request (use `bdk_next`).
- Download 200: `{project_code, downloads, install_note}` with private links you may share with the customer.
- Errors: `project_code_required`, `invalid_request`, `project_not_found`, `action_not_allowed` (409; may include `next_step`, holds or `failing_assets`), `upstream_error`.

## bdk_check

- Args: `{project_code, run?}`. 200: `{project_code, health_snapshot, health_checked_at, checked_age}`, plus `{ran, scheduled, note}` with `run: true`.
- Call with `run: true` after the customer changes credentials or screens on the portal, when no health snapshot exists yet, or when the customer asks for a new check; otherwise read the last result without `run`. After a `run: true` call, if `scheduled` is true, read again without `run` after a minute and report the relevant check and `health_checked_at`. If false, say the check was not scheduled and use the portal.
- A `pass` is an observation, never "you're covered".
- Extra errors: `project_code_required`, `invalid_request`, `project_not_found`, `upstream_error`.

## Signing in

- The MCP server has no sign-in tool. Signing in and reconnecting are done by the host (for example `/mcp` in Claude Code), never by asking the customer for a code in chat.

## Invite tasks

`invite_tasks` can appear in `bdk_next`, `bdk_projects` and `bdk_check` only for an admin-set invite hold. Only then relay an invite address, quoting that returned entry (service, address, required role, who must act). Never volunteer or list collaborator addresses otherwise, and never send or accept the invite yourself.
