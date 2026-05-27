# Google Play Policy Checklist

Status: not ready for production review until owner/legal review items and live Play subscription tests are complete.

## Data Collected Or Processed

- Account info: email address, Firebase UID/user ID, username, display name, profile photo URL, onboarding state, selected interests.
- User content: notes, links, saved/imported X post content, titles, categories, tags, summaries, projects, recall/search data, exports.
- Photos/media/files: image captures or selected image files, uploaded media references, Firebase Storage files under the user ID.
- Audio: voice capture/transcript content when the user saves voice memories.
- Purchase data: RevenueCat customer ID, product/entitlement status, store purchase state. Nomi should not receive full payment card details.
- App activity/diagnostics: backend request logs, sync status, import errors, AI processing status, operational diagnostics.
- Identifiers: Firebase Auth UID, RevenueCat app user ID, device/store identifiers exposed by SDKs as needed for auth, purchases, and diagnostics.
- Third-party import data: X OAuth tokens/import connection records when connected, public X post metadata imported by the user.
- AI metadata: generated summaries, categories, tags, concepts, entities, claims, embeddings/chunks, memory edges, topic pages, and daily briefs tied to the user.

Owner/legal review required: confirm exact Play Data safety categories, retention windows, and whether any diagnostics are collected by Google/Firebase SDK defaults beyond app code.

## Third-Party SDKs And Services

- Firebase Auth: authentication and account identity.
- Firestore: profile, memory, sync, project, AI metadata, and app data.
- Firebase Storage: user-uploaded files under `users/{uid}/`.
- RevenueCat / `react-native-purchases`: subscription products, purchase/restore, entitlement status.
- Google Play Billing: Android subscription billing via RevenueCat SDK.
- Google Sign-In: Android/Google authentication.
- X API/OAuth: optional bookmark/import connection and public post import.
- OpenAI or configured AI provider: optional AI processing, summaries, recall, and embeddings.
- Expo/React Native libraries: document picker, file system, sharing, notifications, secure store, haptics, web browser.
- Backend hosting/provider: production API, legal pages, account deletion, AI/import processing.

Owner/legal review required: name the actual backend hosting provider and AI provider used in production.

## Play Console Data Safety Declarations To Prepare

- Data collection: Account info, User IDs, User content, Photos or videos where image capture/upload is live, Audio files/voice content where voice capture is live, Purchases, App activity, Diagnostics, and Device or other IDs as applicable.
- Data sharing: declare service-provider sharing for Firebase, RevenueCat, Google Play, AI provider, backend hosting, and X import where applicable. Do not mark data as sold unless owner/legal determines otherwise.
- Security practices: confirm data is encrypted in transit; confirm deletion request mechanism is available in app; confirm whether users can request deletion outside the app through support.
- Purpose mapping:
  - App functionality: auth, memories, recall, import, subscriptions.
  - Analytics/diagnostics or developer communications only if production telemetry/support workflows actually collect those.
  - Account management: profile and deletion.
  - Fraud prevention/security: auth, purchase validation, abuse prevention.
- Optional data: user content, X connection, media/audio captures, and AI processing are user-initiated.

Owner/legal review required: final Data safety form selections and retention statements.

## Required Public URLs

- Privacy Policy: must be public, non-login, and match Settings > More > Privacy Policy.
- Terms of Use: must be public, non-login, and match Settings > More > Terms of Use.
- Support URL/email: must match Settings > More > Contact Support and Play Console Store settings.
- Account deletion help URL: optional if Play Console asks for a web deletion URL, but the in-app path is Settings > More > Delete account.

Current implementation:

- Backend serves `/privacy` and `/terms`.
- Settings derives public legal URLs from `EXPO_PUBLIC_API_BASE_URL` unless explicit `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `EXPO_PUBLIC_TERMS_OF_USE_URL` are set.
- `EXPO_PUBLIC_SUPPORT_URL` should be set before submission.

## In-App Required Links And Actions

- Privacy Policy: present in Settings > More > Legal.
- Terms of Use: present in Settings > More > Legal.
- Contact Support: present in Settings > More > Legal.
- Manage Subscription: present in Settings > More > Nomi Pro and opens Google Play subscription management on Android.
- Restore Purchases: present in Settings > More > Nomi Pro and Paywall.
- Delete Account: present in Settings > More > Account.

## Account Deletion Scope

Implemented backend target:

- Firebase Auth user deletion through Admin SDK when configured.
- Firestore user/profile records by Firebase UID, `id`, and `firebaseUid`.
- Firestore user document trees, including memories, chunks, memory edges, projects, daily briefs, sync state, and AI metadata stored under the user document.
- Backend `sources` records.
- X bookmark connection, sync state, and pending OAuth states tied to the user.
- Firebase Storage files under `users/{uid}/`.
- Local secure-store auth session after deletion succeeds.

Owner verification required:

- Run a production-like test user deletion and confirm Auth, Firestore, Storage, X connection, and AI subcollections are removed.
- Confirm RevenueCat customer records and Google Play order history retention are described accurately; account deletion does not cancel subscriptions.

## RevenueCat / Google Play Billing Readiness

- Android code selects `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`.
- Purchases use `Purchases.purchasePackage` from `react-native-purchases`.
- Restore uses `Purchases.restorePurchases`.
- No Nomi Pro external checkout URL is exposed in app code.
- Paywall and Settings copy say Google Play handles Android billing/cancellation.

Owner verification required:

- Play Console subscriptions created and active.
- RevenueCat Android app connected to Google Play.
- RevenueCat current offering contains Android products.
- Play license tester can buy and restore from a Play-installed internal test build.

## Android Permissions

Declared in `app.json`:

- `INTERNET`: required for backend, Firebase, RevenueCat, X import, AI processing.
- `CAMERA`: only keep if native camera capture is available in the Android build.
- `RECORD_AUDIO`: only keep if voice recording is available in the Android build.
- `POST_NOTIFICATIONS`: only keep if notification prompts/features are enabled for Android.
- `READ_MEDIA_IMAGES`: only keep if image picker/import requires direct media library access.

Generated `android/app/src/main/AndroidManifest.xml` was audited for risky generated permissions:

- `READ_EXTERNAL_STORAGE`: risky/legacy; now blocked in `app.json` and removed from the checked-in manifest.
- `WRITE_EXTERNAL_STORAGE`: risky/legacy; now blocked in `app.json` and removed from the checked-in manifest.
- `SYSTEM_ALERT_WINDOW`: risky/debug/dev-support permission; now blocked in `app.json` and removed from the checked-in manifest.
- `VIBRATE`: low risk; keep only if haptics/notifications use it.

Recommendation: before Play internal testing, inspect the merged release manifest from the built AAB to confirm blocked permissions stayed removed.
Note: `android/app/src/debug/AndroidManifest.xml` still declares `SYSTEM_ALERT_WINDOW` for debug builds; this should not be present in the Play release manifest.

## Final Submission Checks

- [ ] Public privacy URL live.
- [ ] Public terms URL live.
- [ ] Support URL/email live.
- [ ] Settings links open correctly on Android.
- [ ] Delete account smoke-tested against production Firebase.
- [ ] Google Play subscription purchase and restore tested from internal testing.
- [ ] No external checkout links for subscriptions.
- [ ] Play Data safety form reviewed by owner/legal.
- [ ] Android permissions reviewed and unnecessary generated permissions removed or justified.
- [ ] `GOOGLE_PLAY_REVIEW_NOTES.md` reviewer access instructions copied into Play Console.
