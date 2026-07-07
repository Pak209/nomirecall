# Nomi Backend (Dev)

Minimal Express backend for local app development.

## Run

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Server runs at `http://localhost:3000`.

`JWT_SECRET` is now **required in every environment** (dev, staging, production). The
server refuses to start if it is unset or left as the placeholder
`dev-secret-change-me`. After `cp .env.example .env`, generate a strong value:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

and paste it into `JWT_SECRET` in `backend/.env`. The automated test suite sets its
own throwaway `JWT_SECRET`, so `npm test` works without any local configuration.

## Firebase persistence setup

1. In Firebase Console, open your project settings and create a service account key JSON.
2. Save the key locally (example: `backend/keys/firebase-service-account.json`).
3. Set env vars in `backend/.env`:

```env
FIREBASE_PROJECT_ID=ndbrain-f39a0
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/firebase-service-account.json
```

If Firebase env vars are not set, backend falls back to in-memory mode.

In production (`NODE_ENV=production`), Firebase Admin config is required and the backend will fail closed instead of falling back to memory mode.

## Developer retrieval/debug eval

The Ask Nomi debug endpoints and CLI tools are developer-only. Keep them disabled in production.

Enable them locally in `backend/.env`:

```env
ENABLE_NOMI_DEBUG=true
NOMI_API_BASE_URL=http://localhost:3000
```

Start the backend:

```bash
cd backend
npm run dev
```

To get a token for your real signed-in Firebase user:

1. Run a DEBUG iOS build pointed at the local backend, for example `NOMI_BACKEND_API_BASE_URL=http://localhost:3000/api`.
2. Sign in with your dev account.
3. Open Settings.
4. In the local-only Developer Debug card, tap `Copy debug auth token`.
5. Use that clipboard value only as an environment variable. Do not paste it into code, docs, commits, screenshots, or shell history you plan to share.

Run retrieval eval:

```bash
cd backend
NOMI_DEBUG_AUTH_TOKEN="<paste-token>" npm run eval:brain
```

Run a one-off trace:

```bash
cd backend
NOMI_DEBUG_AUTH_TOKEN="<paste-token>" npm run debug:brain -- --question="What have I saved about pricing?"
```

The native token copy action is compiled only in DEBUG builds and appears only when the iOS app is pointed at `localhost`, `127.0.0.1`, or `::1`. The CLI never prints token values.

## Render environment

Set production secrets only in the Render dashboard. Do not commit real `.env` files or Firebase service account JSON.

Required production variables:

```env
NODE_ENV=production
JWT_SECRET=
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT_JSON=
```

Use `FIREBASE_SERVICE_ACCOUNT_PATH` only when the secret file is provided by Render or another secure runtime mechanism. Add `X_BEARER_TOKEN` or `TWITTER_BEARER_TOKEN` on Render when X import/discovery should be live.

For X bookmark imports, configure an OAuth 2.0 app in the X developer portal with this callback URL:

```env
X_REDIRECT_URI=https://your-backend.example.com/api/x/oauth/callback
```

Then set:

```env
X_CLIENT_ID=
X_CLIENT_SECRET= # optional for public PKCE apps
X_REDIRECT_URI=
X_TOKEN_ENCRYPTION_KEY= # 32+ random chars
```

The bookmark MVP requests `tweet.read users.read bookmark.read offline.access`, stores the refresh token encrypted, and exposes manual sync through `/api/x/bookmarks/sync`.

## RevenueCat subscription webhook

`POST /api/webhooks/revenuecat` receives subscription lifecycle events from RevenueCat and updates the user's `tier` (`free` | `brain` | `pro`). It is intentionally not behind the app auth middleware — the caller is RevenueCat, not a logged-in user.

Authentication is by a **static Authorization header** that you configure on the webhook in the RevenueCat dashboard (RevenueCat does not HMAC-sign the body). The backend compares the incoming `Authorization` header against `REVENUECAT_WEBHOOK_SECRET` using a timing-safe comparison.

```env
REVENUECAT_WEBHOOK_SECRET= # must match the Authorization header set in the RevenueCat dashboard
```

Behavior:

- Secret unset → `503` (fails safe; the endpoint refuses to accept unsigned events).
- Missing/incorrect Authorization header → `401`, no state change.
- `INITIAL_PURCHASE`/`RENEWAL`/`PRODUCT_CHANGE`/`UNCANCELLATION`/`NON_RENEWING_PURCHASE` → tier derived from `product_id` (`brain_pro_monthly` or any `pro` → `pro`; `brain_monthly` or any `brain` → `brain`).
- `CANCELLATION`/`EXPIRATION`/`SUBSCRIPTION_PAUSED`/`BILLING_ISSUE` → downgrade to `free`.
- `TEST` and unknown event types → `200 { ignored: true }` (acknowledged, no change).
- Unknown `app_user_id` → still `200` (so RevenueCat stops retrying) with `updated: false`.

The webhook's `app_user_id` is the backend `user.id` (the mobile client sets RevenueCat's `appUserID` to it), so it maps directly via `store.getUserById(app_user_id)`.

**Live activation is a human/operator step:** the endpoint stays inert until an operator sets a real `REVENUECAT_WEBHOOK_SECRET`, configures the matching Authorization header + webhook URL in the RevenueCat dashboard, and replays a sandbox event to confirm.

## App config

In app `.env`:

```env
API_BASE_URL=http://localhost:3000/api
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api
```

Then restart Expo.

## Implemented routes

- `GET /api/health`
- `GET /privacy`
- `GET /terms`
- `POST /api/auth/email`
- `POST /api/auth/email/signup`
- `POST /api/auth/signin`
- `POST /api/auth/signup`
- `PATCH /api/auth/interests`
- `PATCH /api/auth/tier`
- `POST /api/webhooks/revenuecat`
- `GET /api/x/discover`
- `GET /api/x/bookmarks/connect`
- `GET /api/x/oauth/callback`
- `GET /api/x/bookmarks/status`
- `POST /api/x/bookmarks/sync`
- `DELETE /api/x/bookmarks/connection`
- `GET /api/feed`
- `POST /api/feed/:id/ingest`
- `GET /api/stats`
- `GET /api/wiki`
- `GET /api/wiki/:slug`
- `GET /api/claims`
- `GET /api/entities`
- `POST /api/brain/query`
- `POST /api/ingest`
- `POST /api/process`
- `GET /api/sources`

`GET /api/health` now includes `persistence` (`firestore` or `memory`) so you can verify mode quickly.

## API contract docs

See `backend/docs/api-contract.md` for auth/dashboard request/response specs, error codes, password policy, and forgot-password reset behavior.
