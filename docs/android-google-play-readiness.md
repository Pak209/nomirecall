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

1. Create the Android app in RevenueCat with package name `com.dkimoto.nomi`.
2. Add the Android public SDK key to `.env`:
   - `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...`
3. Create subscriptions in Play Console and activate them for closed testing.
4. Add the Play subscription product IDs to RevenueCat offerings.
5. Confirm these env values match RevenueCat/Play products:
   - `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`
   - `EXPO_PUBLIC_REVENUECAT_BRAIN_PRODUCT_ID`
   - `EXPO_PUBLIC_REVENUECAT_PRO_PRODUCT_ID`
6. Add Google Play service account credentials to RevenueCat so RevenueCat can validate Play purchases.

## Android Permission Audit

Declared permissions:

- `INTERNET`: backend, Firebase, RevenueCat, X post import.
- `CAMERA`: image capture readiness.
- `RECORD_AUDIO`: voice capture readiness.
- `READ_MEDIA_IMAGES`: Android 13+ media picker/library access readiness.
- `POST_NOTIFICATIONS`: notification prompts on Android 13+.

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
