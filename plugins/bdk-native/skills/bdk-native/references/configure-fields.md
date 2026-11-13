# bdk_configure fields

Only the fields below can be written. Everything else is refused with a reason. Apply documented, customer-approved values only; if a value format is not documented here, use the portal instead of guessing.

## Writable fields

`app_name`, `launch_link`, `product_selected`, `statusbar_color`, `app_icon_link`, `app_orientation_ios`, `app_orientation_android`, `target_devices_ios`, `app_tracking_ios`, `background_audio_ios`, `background_location_enabled_android`, `location_precision_android`, `message_apptracking`, `message_camera`, `message_contacts`, `message_geolocation`, `message_medialibrary`, `message_microphone`, `message_photos`, `android_notification_icon_zip`, `ios_listing_info`, `android_listing_info`, `apple_team_name`, `apple_entity_type`, `apple_account_holder_email`, `apple_team_id`, `ios_app_listing_id`, `ios_app_bundle_id`, `android_package_name`, `onesignal_app_id`, `push_enabled`, `push_prompt_mode`, `tnc_accepted`, plus the feature-group fields in the table.

Two need special care:
- `tnc_accepted`: set only after the customer explicitly says yes to the terms for this project (link https://thebdk.com/terms). Signing in or approving the connection is not acceptance.
- `product_selected`: set only after asking iOS / Android / Both. Prefer `confirm_product` on `bdk_next`.

## Values

| Field | Accepted values |
|---|---|
| `app_name`, `apple_team_name`, `onesignal_app_id` | Customer-approved text; use the customer's real team name and OneSignal app ID. |
| `launch_link`, `android_notification_icon_zip` | URL strings. `launch_link` changes what installed apps open, without a rebuild: read the exact URL back and get approval first. |
| `app_icon_link` | This project's `sb://project-files/<code>/agent-…` reference from `bdk_upload` with `purpose: "app_icon"`. External URLs are refused (`icon_upload_required`). Local files: portal upload. |
| `apple_team_id`, `ios_app_listing_id`, `ios_app_bundle_id`, `android_package_name` | Customer-approved, non-empty identifiers copied from their Apple team, App Store Connect record or existing app; never invent them. Bundle and package IDs apply only to an app built by another developer. After purchase only missing values can be added (`metadata_locked`). |
| `product_selected` | Exactly `iOS`, `Android` or `Both`, after confirmation. |
| `statusbar_color` | `#RRGGBB`. Updates installed apps without a rebuild, so get approval for the live change. |
| `app_orientation_ios`, `app_orientation_android` | `portrait`, `landscape` or `both`. |
| `target_devices_ios` | `iphone`, `ipad` or `both`. |
| `location_precision_android` | `coarse` or `precise`. |
| `app_tracking_ios`, `background_audio_ios` | Boolean or `Yes` / `No`. |
| `background_location_enabled_android` | Boolean or `Yes` / `No`. Android only, for a real location need; needs the Play background-location declaration and extra Play review; needs a rebuild and store update. |
| `push_enabled` | Boolean or `Yes` / `No`. On by default. `No` builds the app without push: no permission prompt, and no OneSignal, Firebase or APNs keys needed. Turning push off or on takes a rebuild and store update; stored keys are kept. While push is off, don't set `onesignal_app_id` or ask for push credentials. |
| `push_prompt_mode` | `automatic` (ask when the app opens, the default) or `manual` (ask when the web app calls `push.request()`). Applies while push is on; cannot be cleared. Updates installed apps without a rebuild, so get approval for the live change. |
| Seven `message_*` fields | Customer-approved purpose text, up to 2,000 characters each. |
| `ios_listing_info`, `android_listing_info` | Existing-listing status, not listing copy: exactly `No`, `Yes, built with BDK Native` or `Yes, built by another developer`. |
| `apple_account_holder_email` | The account holder's email; only for Individual accounts. |
| `apple_entity_type` | Exactly `Individual` or `Company / Organization`. |
| `tnc_accepted` | `true` only after explicit acceptance for this project. |
| `app_platform` | `bubble` or `code`; scopes which settings show, not the purchased platform. |
| `app_platform_name` | Optional text, up to 80 characters after clean-up. |
| `feature_badge_autoclear_android` | `Yes` / `No`: clear notifications and badge when the Android app opens. |
| `feature_nfc_enabled_ios`, `feature_nfc_enabled_android` | `Yes` / `No`, per platform. |
| `feature_nfc_usage_description` | 1–150 characters; required when NFC is on for iOS. |
| `feature_nfc_launch_domain` | Optional bare domain, up to 253 characters, no scheme, port or path. |
| `feature_nfc_launch_path_prefix` | Optional, up to 2,000 characters; starts with `/`, then letters, digits, `.`, `_`, `~`, `%`, `/`, `-`. Needs a launch domain. |
| `feature_health_read_enabled_ios`, `feature_health_read_enabled_android` | `Yes` / `No`, per platform. |
| `feature_health_read_types` | Comma-separated, up to 2,000 characters; required when health read is on. Case-sensitive: `steps`, `distance`, `activeCalories`, `heartRate`, `restingHeartRate`, `weight`, `height`, `bloodOxygen`, `sleep`, `workouts`. |
| `feature_health_read_usage_description` | Optional, up to 2,000 characters; blank uses a generated description. |
| `feature_health_read_privacy_policy_url` | Absolute HTTPS URL, up to 2,000 characters; required when health read is on. |
| `feature_share_inbound_enabled`, `feature_share_inbound_open_app` | `Yes` / `No`: sharing into the app on both platforms / bring the app forward after sharing on iOS. |
| `feature_share_inbound_types` | Comma-separated, up to 2,000 characters; at least one when on: `text`, `url`, `image`, `video`, `file`. |
| `feature_share_inbound_upload_url` | Absolute HTTPS URL, up to 2,000 characters; required when types include `image`, `video` or `file`. |
| `feature_share_inbound_max_size_mb` | Digit string for 1–200; required when types include `image`, `video` or `file`. |
| `feature_push_data_enabled` | `Yes` / `No`: silent data-only messages. Needs push on. |

Feature text is trimmed; `null` or an empty string clears text and choice fields, subject to required fields. One invalid value can reject its whole batch, so send live changes separately and check uncertain results on the portal. Time-sensitive notification fields are refused (`alpha_field`); don't offer them or describe them as coming.

## Refused field classes

- `portal_only_secret`: `branchio_live_api_key`, `branchio_live_secret`, `branchio_test_api_key`, `branchio_test_secret`, `chottulink_sdk_api_key`, `feature_share_inbound_upload_headers`, `feature_health_read_reviewer_demo_instructions`. The last two can hold credentials: portal only, never chat. Upload headers are required on the portal when image, video or file sharing is on (`{}` if none); reviewer demo instructions are required when health read is on.
- `portal_only_pairing`: `branchio_deeplinks_enabled`, `chottulink_deeplinks_enabled`, `branchio_universal_links_domain`, `branchio_app_id`, `chottulink_domain`.
- `provisioner_or_locked`: `firebase_project_id`, `android_keystore_file_urls`.
- `metadata_locked`: identity fields after purchase, or when required context can't be read.
- `clearing_unsupported`: metadata fields can't be cleared; omit the key or send a replacement.
- `unknown_field`: anything not documented.
- `invalid`: a rejected value.

After purchase, saved `apple_team_name`, `apple_team_id`, `apple_entity_type`, `apple_account_holder_email`, `ios_app_bundle_id`, `ios_app_listing_id`, `android_package_name` and `onesignal_app_id` are locked; only missing values can be filled. Locked identity changes need BDK admin, through the portal support chat.

## Instant changes and rebuilds

The website updates in the app instantly. Three settings also change installed apps without a rebuild: the launch URL (`launch_link`), the status-bar colour (`statusbar_color`) and push prompt timing (`push_prompt_mode`). Prompt timing applies on the next app launch, only affects people not yet asked, and apps built before Android v2.21 or iOS v2.16 always ask at launch.

Everything else on the build-settings form is build-time: icon, the three screens, orientation, permission messages, push on/off and push setup, deep-link setup and the native feature groups. On a delivered app these take effect in the next rebuild. For the current answer, BDK's article is reference data: https://bdk.crisp.help/en-us/article/do-i-need-a-rebuild-every-time-i-make-changes-to-my-bubble-app-mhzfub/

Screens: the customer replaces a splash, loading or transition image in Build Settings → Screens on the portal and saves. Then call `bdk_check` with `run: true` and read the result again after a minute.
