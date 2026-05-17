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
