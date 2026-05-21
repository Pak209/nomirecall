# Nomi Recall Launch Readiness QA

Date: 2026-05-14

## Static QA Results

| Flow | Status | Notes |
| --- | --- | --- |
| Email/password sign up | Pass by code review | `AuthStackView` validates non-empty email and 6+ character password, calls Firebase Auth via `AuthService.signUp`, and routes from auth state. Manual Firebase account creation still required on device. |
| Email/password login | Pass by code review | `AuthStackView` calls `AuthService.signIn`; auth listener in `AppSession` drives the post-login route. Manual invalid-password and disabled-provider checks remain. |
| Logout | Fixed | `AuthService.signOut` now signs out of Google Sign-In before Firebase sign-out so Google sessions do not silently persist after logout. |
| Google login | Pass by code review | Uses Firebase client ID, top-most presenter, Google ID token, and Firebase credential exchange. Manual device verification required for URL scheme and plist configuration. |
| Onboarding saves and does not repeat | Pass by code review | `MeetNomiView` calls `AppSession.completeOnboarding`, which writes `onboardingCompleted: true`; route checks profile before showing onboarding. Manual relaunch check remains. |
| Quick Capture note/link/image/voice basics | Pass by code review | All capture modes save through `MemoryStore.create`; image and voice currently capture typed descriptions/transcripts rather than media recording/upload. |
| X import URL variants | Fixed | App-side X detection now parses hosts and `/status/:id` paths instead of substring matching; backend accepts `x.com`, `twitter.com`, mobile subdomains, query strings, and scheme-less links while rejecting normal links. |
| Recall search/filter | Fixed | Search covers title, content, and tags; category filter works. Empty state now distinguishes no memories from no matches, and Recall now surfaces load errors. |
| Memory detail edit/delete | Pass by code review | Detail view edits title/content/category/tags and calls store update/delete with confirmation. Manual Firestore persistence check remains. |
| Obsidian Markdown export via share sheet | Pass by code review | Detail view writes a `.md` file to temp exports and presents `UIActivityViewController`; Markdown includes frontmatter, source, links, media, and referenced posts. Manual share-to-Obsidian check remains. |
| Empty/loading/error states | Partial pass | Splash/loading/auth/capture/detail/home/recall states exist; Recall error/empty handling improved. Manual offline/Firebase-denied testing remains. |

## Validation

- `npm run typecheck`: pass
- `npm run test:backend`: pass
- iOS build: pass
  - Command: `xcodebuild -quiet -workspace /Users/danielpak/Downloads/second-brain-app/ios/Nomi.xcworkspace -scheme Nomi_App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /private/tmp/nomi-derived-data CODE_SIGNING_ALLOWED=NO build`

## Remaining Manual Device Tests

- Create a fresh email/password account, quit/relaunch, confirm onboarding appears once, complete onboarding, quit/relaunch again, confirm main tabs open.
- Sign out after email login and confirm auth screen returns.
- Sign in with Google on a real/simulator build with the production `GoogleService-Info.plist`; sign out and confirm the next Google flow prompts or uses the expected account chooser behavior.
- Save one note, one normal link, one image description, and one voice transcript; confirm each appears in Home and Recall with the expected type/category/tags.
- Import X links using `https://x.com/.../status/...`, `https://twitter.com/.../status/...?s=20`, `https://mobile.twitter.com/.../status/...`, and `x.com/.../status/...?ref=share`; confirm normal links do not show the X import action.
- Search by title/content/tag and filter by category; clear search/filter and confirm the full list returns.
- Edit and delete a memory from detail; confirm Firestore and the in-app list update.
- Export a memory as Markdown and share to Obsidian or Files; confirm filename, frontmatter, links, and source fields are usable.
- Test offline or denied Firebase permissions for auth, load, save, update, delete, X import, and export failure messaging.
