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
