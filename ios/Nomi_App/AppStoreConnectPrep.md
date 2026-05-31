# Nomi TestFlight and App Store Connect Prep

## Current Native Target

- Workspace: `ios/Nomi.xcworkspace`
- Scheme: `Nomi_App`
- App display name: `Nomi Recall`
- Bundle identifier: `com.dkimoto.nomi.recall`
- Version: `1.0`
- Build number: `17`
- Deployment target: iOS 17.0
- Signing: Automatic signing is enabled with Development Team `5YJJCSFSQM`.

## Before First Archive

1. In Apple Developer/App Store Connect, confirm the App ID for `com.dkimoto.nomi.recall`.
2. In Xcode, confirm the `Nomi_App` target uses Development Team `5YJJCSFSQM`.
3. In App Store Connect, create the app record:
   - Platform: iOS
   - Name: Nomi Recall
   - Bundle ID: `com.dkimoto.nomi.recall`
   - SKU: `nomi-ios`
4. Replace the Release backend URL build setting:
   - Target: `Nomi_App`
   - Build Settings: `NOMI_BACKEND_API_BASE_URL`
   - Release value is currently `https://nomirecall.onrender.com/api`
5. Confirm the production backend has:
   - `X_BEARER_TOKEN`
   - Firebase Admin credentials
   - HTTPS enabled
6. Configure RevenueCat/App Store Connect products:
   - Entitlement: `Nomi Pro`
   - Products: `monthly`, `yearly`, `lifetime`
   - Offering attached to the RevenueCat paywall

## Archive From Xcode

1. Open `ios/Nomi.xcworkspace`.
2. Select scheme `Nomi_App`.
3. Select destination `Any iOS Device`.
4. Product > Archive.
5. In Organizer, Distribute App.
6. Choose App Store Connect.
7. Upload for TestFlight processing.

Latest local archive/export check:

- Archive path: `build/Nomi.xcarchive`
- App Store export: `build/app-store-export/Nomi Recall.ipa`
- Export signing: Cloud Managed Apple Distribution, team `5YJJCSFSQM`
- Exported bundle/build: `com.dkimoto.nomi.recall` / `17`

## Command Line Archive

Use this after signing/team/backend URL are configured:

```sh
xcodebuild archive \
  -workspace ios/Nomi.xcworkspace \
  -scheme Nomi_App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/Nomi.xcarchive
```

## App Store Connect Metadata Draft

- Subtitle: Capture anything. Recall it fast.
- Category: Productivity
- Age rating notes: No user-generated public content, no gambling, no unrestricted web access.
- Privacy summary:
  - Account email is used for authentication.
  - User-entered notes, links, imported posts, and memory metadata are stored in Firebase.
  - X links can be sent to the Nomi backend for post import/discovery.
  - Purchases/subscription state are handled by RevenueCat.

## Share Extension

Add after the core app is stable. Use an App Group so the extension can write a small queued payload, then the main app can read it and save through Firebase/backend.

Recommended App Group:

```text
group.com.dkimoto.nomi.recall
```
