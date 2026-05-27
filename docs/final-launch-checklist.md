# Nomi Recall Final Launch Checklist

Date: 2026-05-14

## Passed

- Account deletion path exists and is discoverable in Settings:
  - Settings > Danger Zone > Delete Account
  - Confirmation dialog appears before deletion.
  - Copy explains Firebase profile, saved memories, and uploaded files are deleted.
  - Copy explains Apple subscription billing must be canceled separately.
- Privacy Policy and Terms links exist in Settings:
  - Settings > Legal > Privacy Policy
  - Settings > Legal > Terms of Use
  - Links derive from the configured backend public base URL.
- Subscription controls exist in Settings:
  - Upgrade/View plans opens the Nomi Pro paywall.
  - Restore purchase exists.
  - RevenueCat Customer Center exists.
  - Manage Apple Subscription opens Apple subscription settings.
- RevenueCat entitlement check uses `Nomi Pro`:
  - `RevenueCatBootstrap.proEntitlementIdentifier = "Nomi Pro"`.
- Core app flows are reachable by code review:
  - Auth: splash/auth stack with email/password and Google login.
  - Onboarding: Meet Nomi completion gates main app route.
  - Capture: Main tab bar opens Quick Capture.
  - Recall: Main tab bar opens Recall search/filter.
  - Detail: Home and Recall navigate to Memory Detail.
  - Export: Memory Detail includes Obsidian Markdown share, copy, and preview actions.
- Firestore and Storage rules appear UID-scoped:
  - Firestore uses `request.auth.uid == userId`.
  - Storage uses `request.auth.uid == userId`.
- No obvious committed secrets found:
  - Tracked env files are examples only.
  - Real `.env`, backend `.env`, staging env, and real `GoogleService-Info.plist` are not tracked.
  - Secret scan only matched placeholder/template references.
- App Store submission doc exists:
  - `docs/app-store-submission.md`.
- Validation passed:
  - `npm run typecheck`
  - `npm run test:backend`
  - Native iOS simulator build:
    `xcodebuild -quiet -workspace /Users/danielpak/Downloads/second-brain-app/ios/Nomi.xcworkspace -scheme Nomi_App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /private/tmp/nomi-derived-data CODE_SIGNING_ALLOWED=NO build`

## Needs Manual Testing

- Create a fresh email/password account on a TestFlight or release-like build.
- Sign in with Google using the production Firebase plist and URL scheme.
- Complete onboarding, quit/relaunch, and confirm onboarding does not repeat.
- Save each Quick Capture type:
  - Note
  - Link
  - Image description
  - Voice transcript
- Import X links using real configured backend credentials:
  - `x.com`
  - `twitter.com`
  - `mobile.twitter.com`
  - query-string links
  - normal non-X links
- Search and filter Recall with multiple categories/tags.
- Edit and delete a Memory Detail record and confirm Firebase updates.
- Export Markdown through the share sheet to Files and Obsidian.
- Confirm Privacy Policy and Terms URLs open on device.
- Test account deletion end to end, including recent-login error behavior.
- Test RevenueCat purchase flow in StoreKit/TestFlight sandbox:
  - Paywall loads App Store price.
  - Purchase activates `Nomi Pro`.
  - Restore purchases works.
  - Manage Apple Subscription opens Apple settings.
- Confirm App Store screenshots use non-sensitive sample data from `docs/review-demo-data-flow.md`.
- Fill App Store Connect review credentials and final support/privacy URLs.

## Blockers

- No app-code launch blockers found in this sweep.
- Validation gap: `npm run lint` does not run because ESLint has no configuration file in the repo. This is not an app runtime blocker, but either add an ESLint config or remove/fix the script before treating lint as a release gate.

## Nice-To-Have Later

- Add Firebase emulator tests for Firestore and Storage rules.
- Add a small automated UI smoke test for auth route, capture, recall, detail, and settings.
- Add an ESLint config that matches the current TypeScript/React Native setup.
- Add a release-mode archive CI command once signing and App Store Connect credentials are finalized.
- Add screenshot automation for the required App Store device sizes.

## Code Change Notes

- This sweep created `docs/final-launch-checklist.md` only.
- Existing uncommitted app/backend changes from prior launch-readiness and data-safety work remain in the working tree.
