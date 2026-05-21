# Nomi Recall Data Safety Audit

Date: 2026-05-14

## Findings

| Area | Status | Notes |
| --- | --- | --- |
| Firestore rules | Pass | `firestore.rules` only allows `/users/{userId}` and `/users/{userId}/memories/{memoryId}` when `request.auth.uid == userId`; memory creates/updates must keep `userId` equal to the authenticated UID. |
| Storage rules | Pass | `storage.rules` only allows access under `/users/{userId}/...` when `request.auth.uid == userId`. |
| Firebase config | Pass | Real `GoogleService-Info.plist` is ignored; only `GoogleService-Info.example.plist` is tracked. App skips Firebase setup if the real plist is absent. |
| Backend secrets | Fixed | Production now requires `JWT_SECRET` and Firebase Admin environment variables. Local/test can still use memory mode and the dev JWT fallback. |
| Backend health | Pass | `GET /api/health` exists and returns service status plus persistence mode. |
| Render cold starts | Fixed | React Native and native iOS backend clients now use timeouts and user-friendly backend waking/offline copy. |
| Tracked secrets | Pass after scan | Tracked files contain templates/placeholders only; local `.env` files are ignored and were not printed. |
| Firebase rules tests | Not present | No Firebase emulator/rules test suite was found in the repo. Rules were reviewed statically. |

## Manual Render Checks

1. In Render, set backend environment variables only in the Render dashboard:
   - `NODE_ENV=production`
   - `JWT_SECRET`
   - `FIREBASE_PROJECT_ID`
   - exactly one Firebase Admin credential path/source supported by the deployed service
   - `X_BEARER_TOKEN` or `TWITTER_BEARER_TOKEN` if X import/discovery should be live
2. Confirm local `.env`, `backend/.env`, and any service-account JSON files are not committed.
3. Deploy backend and open `https://nomirecall.onrender.com/api/health`.
4. Confirm health response is `ok: true` and `persistence: firestore`.
5. Confirm missing production env fails deploy/startup instead of falling back to memory mode.

## Manual Firebase Checks

1. Deploy Firestore rules from `firestore.rules`.
2. Deploy Storage rules from `storage.rules`.
3. In Firebase Console, confirm Email/Password and Google sign-in providers are enabled as intended.
4. On a signed-in test user, create/read/update/delete only documents under `/users/{uid}` and `/users/{uid}/memories`.
5. Verify another authenticated user cannot read or write the first user's profile, memories, or storage paths.
6. Verify unauthenticated users cannot read or write profile, memory, or storage data.

## Validation Run

- `npm run typecheck`: pass
- `npm run test:backend`: pass, including `GET /api/health`
- Native iOS simulator build: pass
- Firebase rules tests: not run because no rules test suite is present
- Tracked-file secret scan: pass; only placeholder/template references were matched
