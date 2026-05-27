# Nomi Android / Google Play Readiness

## Current Android Configuration

- Expo-managed Android support is configured in `app.json`.
- Android package/application ID: `com.dkimoto.nomi`.
- Firebase config path: root `google-services.json` (not committed).
- Template: `google-services.example.json`.
- EAS profiles now produce Android APKs for internal testing and an AAB for production.
- `expo-build-properties` pins Android `compileSdkVersion` and `targetSdkVersion` to `35`.

## Firebase Setup

1. In Firebase Console, add an Android app with package name `com.dkimoto.nomi`.
2. Add SHA-1 and SHA-256 certificates for every signing context:
   - Local debug keystore for `expo run:android`.
   - EAS development/internal distribution signing key.
   - Google Play app signing certificate after the app is created in Play Console.
3. Download the Android `google-services.json` and place it at the repo root:
   - `/Users/danielpak/Downloads/second-brain-app/google-services.json`
4. Enable Firebase Auth providers:
   - Email/Password.
   - Google.
5. Put the Web OAuth client ID in `.env`:
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...apps.googleusercontent.com`
6. Keep backend Firebase Admin configured in production with one of:
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `FIREBASE_SERVICE_ACCOUNT_PATH`
   - `FIREBASE_PROJECT_ID` where application default credentials are available.

## Google Sign-In Notes

- Android Google login uses `@react-native-google-signin/google-signin`.
- The app signs into Firebase Auth with the Google credential, then sends a Firebase ID token to the Nomi backend.
- The backend now accepts verified Firebase ID tokens on `/api/auth/signin` and `/api/auth/signup`.
- If sign-in fails with `DEVELOPER_ERROR`, the package name or SHA fingerprint in Firebase/Google Cloud does not match the installed build.

Useful commands:

```sh
# Local debug SHA fingerprints
keytool -list -v -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android

# EAS Android credentials / fingerprints
npx eas credentials -p android
```

## RevenueCat / Google Play Billing

Current app status:

- `react-native-purchases` is installed and already used by the React Native paywall.
- Android selects `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` automatically.
- The Android paywall uses Google Play wording and can use Android-specific product IDs if they differ from iOS.
- Settings > More > Nomi Pro opens the shared paywall.

Setup steps:

1. In Play Console, create the app with package name `com.dkimoto.nomi`.
2. Upload an internal/closed-testing AAB before relying on subscription product availability.
3. Create subscriptions in Play Console:
   - Suggested subscription/product IDs:
     - `brain_monthly`
     - `brain_pro_monthly`
   - Each subscription needs an active base plan and testing availability.
4. Create the Android app in RevenueCat with package name `com.dkimoto.nomi`.
5. Connect Google Play to RevenueCat:
   - Enable the Google Play Android Developer API.
   - Create/grant a Play service account.
   - Upload/add the service account credentials in RevenueCat.
   - Grant the account permission to view/manage orders/subscriptions as required by RevenueCat.
6. Import or add the Play subscription products in RevenueCat.
7. Attach the Android products to the same RevenueCat offering used by the app's current offering.
8. Confirm these env values match RevenueCat/Play products:
   - `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...`
   - `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`
   - `EXPO_PUBLIC_REVENUECAT_BRAIN_PRODUCT_ID`
   - `EXPO_PUBLIC_REVENUECAT_PRO_PRODUCT_ID`
   - Optional Android-specific overrides:
     - `EXPO_PUBLIC_REVENUECAT_ANDROID_BRAIN_PRODUCT_ID`
     - `EXPO_PUBLIC_REVENUECAT_ANDROID_PRO_PRODUCT_ID`
9. Add tester Gmail accounts to the Play testing track and license testing.
10. Install from Play internal/closed testing, not only `expo run:android`, before expecting Google Play purchases to work.

Useful checks:

- Paywall shows "Setup" when RevenueCat returns no package for a plan.
- Paywall shows "Live" and Google Play prices after the products are active and attached to the current RevenueCat offering.
- Test purchases should activate the backend tier through `PATCH /api/auth/tier` after RevenueCat returns active entitlements.

## Android Permission Audit

Declared permissions:

- `INTERNET`: backend, Firebase, RevenueCat, X post import.
- `CAMERA`: image capture readiness.
- `RECORD_AUDIO`: voice capture readiness.
- `READ_MEDIA_IMAGES`: Android 13+ media picker/library access readiness.
- `POST_NOTIFICATIONS`: notification prompts on Android 13+.
- Blocked/removed as unnecessary or risky for release: `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`.

Current implementation note: the RN quick capture screen currently uses document picking for images and text entry for voice memories, so camera/microphone permissions are readiness declarations for the existing product surface rather than proof that native camera/recorder capture is complete.

## Core Android QA Checklist

- [ ] Install APK on a physical Android device.
- [ ] Sign up with email.
- [ ] Sign in with email.
- [ ] Sign in with Google.
- [ ] Complete onboarding.
- [ ] Quick capture text.
- [ ] Quick capture link.
- [ ] Quick capture image/document.
- [ ] Quick capture voice memory entry.
- [ ] Import an X post.
- [ ] Recall search and filters.
- [ ] Open memory detail.
- [ ] Edit a memory.
- [ ] Delete a memory.
- [ ] Export/share Obsidian Markdown.
- [ ] Restore purchases.
- [ ] Purchase a Google Play test subscription.
- [ ] Delete account.

## Google Play Console Remaining Requirements

- [ ] Create Play Console app using package name `com.dkimoto.nomi`.
- [ ] Enroll/confirm Play App Signing.
- [ ] Add Play App Signing SHA-1 and SHA-256 to Firebase, then download a fresh `google-services.json`.
- [ ] Create closed testing track and tester list.
- [ ] Upload production AAB from `npm run build:android:production`.
- [ ] Complete Data safety form for account info, user content/memories, photos/media, audio, purchases, diagnostics, and identifiers as applicable.
- [ ] Complete app content declarations: privacy policy URL, ads status, app access instructions, content rating, target audience.
- [ ] Add screenshots, short description, full description, icon, feature graphic, and contact details.
- [ ] Publish and activate Google Play subscriptions used by RevenueCat.
- [ ] Confirm backend production URL is set in `EXPO_PUBLIC_API_BASE_URL`.
- [ ] Run closed-test smoke pass on a Play-installed build, not only a local debug build.
