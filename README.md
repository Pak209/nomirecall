# Second Brain — iOS App

React Native (Expo) app for the Second Brain knowledge compiler. Full dark theme, tab navigation, feed, brain wiki reader, ingest interface, and paywall.

---

## Project Structure

```
src/
  screens/
    AuthScreen.tsx          ← Apple Sign In + email login
    OnboardingScreen.tsx    ← Interest picker (8 topics)
    FeedScreen.tsx          ← Live curated feed with topic filters
    BrainScreen.tsx         ← Wiki pages + claims viewer
    IngestScreen.tsx        ← Text / URL / Tweet / File tabs
    WikiPageScreen.tsx      ← Markdown wiki page reader
    FeedItemDetailScreen.tsx ← Feed item modal with claims
    SettingsScreen.tsx      ← Plan, interests, account
    PaywallScreen.tsx       ← Subscription upsell
  navigation/
    index.tsx               ← Root stack (auth → tabs)
    MainTabs.tsx            ← Bottom tab bar
  services/
    api.ts                  ← All backend API calls
    auth.ts                 ← Apple Sign In + session restore
  store/
    useStore.ts             ← Zustand global state
  constants/
    theme.ts                ← Colors, typography, spacing, interests
  types/
    index.ts                ← All TypeScript interfaces
App.tsx                     ← Entry point
```

---

## Quick Start (Simulator)

```bash
cd second-brain-app
npm install

# Set up env
cp .env.example .env
# Edit .env: set API_BASE_URL to your backend (ngrok URL or localhost)

# Start
npx expo start --ios
```

---

## TestFlight Build

### Prerequisites
1. **Apple Developer Account** — $99/year at developer.apple.com
2. **EAS CLI** — `npm install -g eas-cli`
3. **Expo account** — free at expo.dev

### One-time setup

```bash
# Login to Expo
eas login

# Initialize EAS for this project
eas init

# This generates a project ID — paste it into app.json → extra.eas.projectId
```

### Update app.json

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.YOURNAME.secondbrain"  // must be unique
    },
    "extra": {
      "eas": { "projectId": "YOUR_PROJECT_ID_FROM_EAS_INIT" }
    }
  }
}
```

### Update eas.json

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "youremail@icloud.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_10_CHAR_TEAM_ID"
      }
    }
  }
}
```

### Build for TestFlight

```bash
# Internal distribution (fastest — no App Store review)
eas build --platform ios --profile preview

# Full production build (goes through App Store Connect)
eas build --platform ios --profile production

# After build completes, submit to TestFlight
eas submit --platform ios
```

EAS handles provisioning profiles and signing automatically — you don't need to touch Xcode.

---

## Wiring RevenueCat (In-App Purchases)

1. Create a RevenueCat account at revenuecat.com
2. Create a new project → iOS app
3. Set up products in App Store Connect first:
   - `com.yourname.secondbrain.brain_monthly` — $12.99/mo
   - `com.yourname.secondbrain.brain_pro_monthly` — $29.99/mo
4. Add products to RevenueCat → add to an Offering
5. Install the SDK:
   ```bash
   npx expo install react-native-purchases react-native-purchases-ui
   ```
6. Add your iOS key to `.env`:
   ```
   REVENUECAT_IOS_KEY=appl_XXXXXX
   ```
7. In `App.tsx`, add initialization:
   ```ts
   import Purchases from 'react-native-purchases';
   Purchases.configure({ apiKey: process.env.REVENUECAT_IOS_KEY! });
   ```
8. In `PaywallScreen.tsx`, uncomment the RevenueCat purchase code (marked with TODO)

---

## Wiring Firebase Auth

The app currently uses a simple email/password endpoint on your backend. To add proper Firebase Auth:

1. Create a Firebase project at console.firebase.google.com
2. Add an iOS app — download `GoogleService-Info.plist`
   - Keep the real plist at `ios/Nomi_App/GoogleService-Info.plist` locally.
   - Do not commit it. Use `ios/Nomi_App/GoogleService-Info.example.plist` as the tracked template.
3. Install:
   ```bash
   npx expo install @react-native-firebase/app @react-native-firebase/auth
   ```
4. Follow [Expo + Firebase setup guide](https://docs.expo.dev/guides/using-firebase/)
5. Enable Apple Sign In in Firebase Console → Authentication → Sign-in methods
6. Your backend already validates Firebase ID tokens — it just needs `firebase-admin` initialized

---

## Backend Connection

The app points to `API_BASE_URL` from `.env`.

**Local development** (same WiFi):
```
API_BASE_URL=http://YOUR_MAC_LOCAL_IP:3000/api
```

**Remote / TestFlight testing** (use ngrok):
```bash
# In your second-brain server directory
npx ngrok http 3000
# Copy the https URL to .env
API_BASE_URL=https://abc123.ngrok.io/api
```

**Production**: Deploy your server to Railway/Render and use that URL.

---

## Backend Changes Needed

The existing second-brain server needs these new routes to support the app:

```
POST /api/auth/signin          ← verify Firebase ID token, return JWT
POST /api/auth/signup          ← create user + save interests
PATCH /api/auth/interests      ← update user interests
PATCH /api/auth/tier           ← update subscription tier (RevenueCat webhook)
GET  /api/feed                 ← paginated feed items (?topics=ai_tech,crypto)
POST /api/feed/:id/ingest      ← add feed item to user's brain
POST /api/auth/email           ← dev-only email/password auth
```

All existing routes (`/ingest`, `/wiki`, `/claims`, etc.) need a JWT middleware added that extracts `user_id` and namespaces all DB queries.

---

## Environment Variables

```env
API_BASE_URL=http://localhost:3000/api
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
REVENUECAT_IOS_KEY=appl_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```
