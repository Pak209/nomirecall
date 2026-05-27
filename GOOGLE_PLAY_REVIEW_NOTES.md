# Google Play Review Notes

## App Access

- Nomi Recall supports email/password and Google sign-in.
- Reviewer-friendly path: create a new account with email/password, complete onboarding, then use the sample capture flows.
- If a seeded reviewer account is preferred, owner should create one before submission and add credentials in Play Console App access. Do not commit reviewer credentials to this repo.

## Suggested Review Flow

1. Open Nomi and sign up with email/password.
2. Complete onboarding by selecting at least one interest.
3. Add a manual note from Quick Capture.
4. Add a link or supported X/Twitter post URL.
5. Open Recall/Search and verify the saved memory appears.
6. Open Settings > More:
   - Privacy Policy
   - Terms of Use
   - Contact Support
   - Manage Subscription
   - Restore Purchases
   - Delete account
7. For subscriptions, install from a Play testing track and use a license tester account. RevenueCat must be configured with active Google Play subscription products before plans show as live.

## Test Subscription Notes

- Nomi Pro purchases use `react-native-purchases` through RevenueCat.
- Android uses the RevenueCat Android public SDK key: `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`.
- The app does not show external checkout links for Nomi Pro.
- Google Play handles Android subscription billing, renewal, cancellation, and refunds.
- Deleting a Nomi account does not cancel Google Play billing; reviewers can use Settings > More > Manage Subscription for Google Play subscription management.

## Account Deletion Notes

Settings > More > Delete account calls `DELETE /api/auth/account`. The intended deletion scope is:

- Firebase Auth user, when Firebase Admin is configured.
- Firestore profile/user records.
- Firestore memories/captures and memory subcollections such as chunks/AI metadata.
- Firestore memory edges, topic/project/daily brief data under the user document.
- Uploaded Firebase Storage files under `users/{uid}/`.
- X OAuth/import connection records and pending OAuth states tied to the user.
- Backend source records and AI retrieval data tied to the user.

Owner should run a real deletion smoke test against the production Firebase project before submission.

## Public URLs

- Privacy Policy: owner must set `EXPO_PUBLIC_PRIVACY_POLICY_URL` or verify `EXPO_PUBLIC_API_BASE_URL` maps to `/privacy`.
- Terms of Use: owner must set `EXPO_PUBLIC_TERMS_OF_USE_URL` or verify `EXPO_PUBLIC_API_BASE_URL` maps to `/terms`.
- Support: owner must set `EXPO_PUBLIC_SUPPORT_URL` and match the Play Console support contact.

## Owner Review Required

- Final support email/URL.
- Final public Privacy Policy and Terms of Use wording.
- Final Play Console App access credentials, if using a pre-created reviewer account.
- Data safety form answers and legal review before production release.
