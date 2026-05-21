# App Store Submission Packet: Nomi Recall

## App Name

Nomi Recall

## Subtitle Options

- Capture anything. Recall it fast.
- Your memory companion for notes and links.
- Save ideas, links, and X posts.
- A private second brain for daily recall.
- Notes, links, and memories in one place.

Recommended subtitle: Capture anything. Recall it fast.

## Description

Nomi Recall helps you save the ideas, links, images, voice thoughts, and posts you want to find again later.

Quick Capture lets you add a note, paste a link, describe an image, or save a voice thought transcript. For supported X and Twitter post links, Nomi can import public post text and related metadata through the Nomi backend when X import is configured.

Recall gives you a searchable memory list with category filters, detail editing, deletion, and Markdown export for Obsidian or Files. Nomi keeps saved memories tied to your signed-in account in Firebase.

Nomi Pro is available through Apple in-app purchase using RevenueCat. The Pro screen explains subscription status, supports restore purchases, and links users to Apple subscription management.

## Keywords

memory,notes,recall,second brain,links,ideas,knowledge,productivity,markdown,obsidian,capture

## URLs

- Support URL: [FILL IN SUPPORT URL]
- Marketing URL: [OPTIONAL: FILL IN MARKETING URL OR LEAVE BLANK IN APP STORE CONNECT]
- Privacy Policy URL: [FILL IN PRIVACY POLICY URL]

Notes:
- The app includes in-app legal links generated from the backend at `/privacy` and `/terms`.
- Current production backend base in code/docs: `https://nomirecall.onrender.com/api`. Confirm the public privacy URL before submission.

## Category Recommendation

Primary category: Productivity

Secondary category option: Utilities

Rationale: The implemented app is a personal capture, recall, search, export, and knowledge organization tool.

## Age Rating Notes

- No gambling, contests, unrestricted web browsing, or user-to-user public content.
- Users can save their own text, links, imported public X post content, image descriptions, and voice-note transcripts.
- X import may display public third-party post text/media references returned by the X API.
- No medical, financial, or legal advice is presented as app-generated guidance.
- Recommended App Store age rating target: 4+ if Apple accepts the user-generated/private-content context; be prepared for 12+ if Apple treats imported social content as potentially mature.

## Screenshot Checklist

Required iPhone screenshot sizes to prepare in App Store Connect:

- 6.9-inch iPhone display: required for current large iPhone submissions.
- 6.5-inch iPhone display: include if App Store Connect requests it for compatibility.
- 5.5-inch iPhone display: include if App Store Connect requests legacy screenshots.

Suggested screenshot set:

- Welcome/auth screen showing Nomi Recall branding.
- Home screen with recent captures and summary card.
- Quick Capture screen with note/link/image/voice options.
- X post import flow after pasting a supported X link.
- Recall search/filter screen.
- Memory detail screen with edit/export controls.
- Settings screen showing subscription, legal links, and account deletion area.
- Nomi Pro paywall screen with price loaded from App Store/RevenueCat.

Do not include real user data, real credentials, private notes, or secret URLs in screenshots.

## Review Notes

### Test Account Credentials

- Email: [FILL IN REVIEW TEST EMAIL]
- Password: [FILL IN REVIEW TEST PASSWORD]
- If Google login must be tested: [FILL IN GOOGLE TEST ACCOUNT OR STATE EMAIL/PASSWORD IS PREFERRED FOR REVIEW]

Do not commit real credentials to the repo.

### X Import Explanation

Nomi Recall supports importing public X/Twitter post links from the Quick Capture Link mode. When a user pastes a supported `x.com` or `twitter.com` status URL, the app shows an "Import X post content" action. The app sends the URL to the Nomi backend, which may call the X API if the backend has an X bearer token configured. If X import is unavailable or the API returns an error, the user can still save the link manually as a memory.

Supported link forms include `x.com`, `twitter.com`, mobile Twitter links, query strings, and scheme-less X links.

### Subscription/Paywall Explanation

Nomi Pro is implemented with RevenueCat and Apple in-app purchase. The paywall is accessible from Settings via "Upgrade to Nomi Pro" or "View plans." It loads the current RevenueCat offering, shows the monthly package when available, starts purchase through RevenueCat, and includes restore purchases. Subscription management is available through the Settings screen via "Manage Apple Subscription" and RevenueCat Customer Center.

The paywall text says Apple charges the user's account and that subscriptions renew unless canceled at least 24 hours before the current period ends.

### Account Deletion Path

Account deletion is available in Settings under "Danger Zone" > "Delete Account." The app confirms deletion before proceeding. Deletion removes the user's Firebase profile, saved memories, and uploaded files, then signs the user out. The Settings screen also explains that deleting the Nomi account does not cancel Apple billing and that subscriptions must be canceled through Apple Subscriptions.

## Apple Review Risk Checklist

### Account Deletion

- Confirm Settings > Danger Zone > Delete Account is visible to signed-in users.
- Confirm deletion removes Firebase profile, memories, and uploaded files.
- Confirm users are warned that Apple subscriptions are managed separately.
- Confirm recent-login Firebase errors are handled with clear copy.

### Subscriptions

- Confirm App Store Connect products match RevenueCat product identifiers exactly.
- Confirm RevenueCat has a Current offering with the monthly package attached.
- Confirm paywall price is loaded from StoreKit/RevenueCat, not hardcoded.
- Confirm restore purchases works.
- Confirm Terms and Privacy links are reachable from Settings.
- Confirm "Manage Apple Subscription" opens Apple subscription settings.

### X API Errors

- Confirm the app can save normal links without X import.
- Confirm unsupported or failed X import shows friendly error copy.
- Confirm backend missing `X_BEARER_TOKEN` does not expose internal setup instructions to users.
- Confirm imported X content is described as public third-party content and not owned by Nomi.

### Paid AI/Discover Wording

- Avoid implying guaranteed AI accuracy or guaranteed discovery results.
- Use cautious wording: "discover relevant posts," "surface memories," "help recall."
- Avoid saying Nomi creates authoritative summaries unless that feature is live and reviewed.
- Confirm any Pro-only wording matches actual entitlements enforced in the build.

### Privacy Labels and Third-Party SDKs

Disclose data and SDKs based on final production configuration:

- Firebase Auth/Firestore/Storage for account, profile, memory, and uploaded-file storage.
- Google Sign-In for Google login.
- RevenueCat for purchases, subscription status, restore purchases, and Customer Center.
- X API/backend processing for public X post import/discovery when used.
- Apple in-app purchase billing.
- User-provided notes, links, tags, categories, image descriptions, voice transcripts, imported post content, and export/share actions.

Confirm App Privacy labels in App Store Connect match actual collection, storage, account linkage, and third-party processing before submitting.

## Manual Fill-In Before Submission

- [ ] Support URL
- [ ] Privacy Policy URL
- [ ] Optional Marketing URL
- [ ] Review test account credentials
- [ ] Final App Store subscription product names/prices
- [ ] Final RevenueCat entitlement/offering/product IDs
- [ ] Final privacy labels
- [ ] Final screenshot set using non-sensitive sample data
