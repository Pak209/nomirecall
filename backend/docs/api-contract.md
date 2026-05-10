# Nomi API Contract (Auth + Dashboard)

This document is the source of truth for frontend/backend integration on auth and home dashboard data.

## Base

- Local base URL: `http://localhost:3000/api`
- Auth mechanism: `Authorization: Bearer <jwt>`
- Content type: `application/json`

## Standard Error Shape

All non-2xx responses return:

```json
{ "error": "Human-readable message" }
```

## Auth Contract

### `POST /auth/email`

Sign in user with email/password.

#### Request

```json
{
  "email": "user@example.com",
  "password": "password123",
  "intent": "signin" // optional, defaults to signin
}
```

#### Success `200`

```json
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "user",
    "tier": "free",
    "interests": []
  }
}
```

#### Errors

- `400` invalid email/password shape
- `401` invalid credentials
- `404` account not found
- `500` server error

---

### `POST /auth/email/signup`

Create user account with email/password.

#### Request

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Success `201`

Same response shape as sign-in.

#### Errors

- `400` invalid request shape
- `409` email already exists
- `500` server error

---

### `PATCH /auth/interests`

Update user interests.

#### Request

```json
{
  "interests": ["ai_tech", "finance"]
}
```

#### Success `200`

```json
{ "ok": true }
```

#### Errors

- `401` missing/invalid token
- `404` user not found
- `400` invalid request

---

### `PATCH /auth/tier`

#### Request

```json
{
  "tier": "free"
}
```

#### Success `200`

```json
{ "ok": true }
```

---

### `GET /x/discover`

Fetch public X posts for the authenticated user's selected interests, or for the comma-separated `topics` query override.

#### Query

```text
topics=ai_tech,startups&limit=20
```

#### Success `200`

```json
{
  "items": [
    {
      "id": "x_123",
      "title": "@example on X",
      "summary": "Post text...",
      "source_type": "tweet",
      "source_name": "X",
      "topic": "ai_tech",
      "published_at": "2026-05-08T12:00:00.000Z",
      "url": "https://x.com/example/status/123",
      "in_brain": false
    }
  ],
  "needsApiKey": false,
  "errors": []
}
```

If `X_BEARER_TOKEN` is not configured, `items` is empty and `needsApiKey` is `true`.

## Password Policy

Current enforced policy:

- minimum length: 8 characters

Recommended near-term policy (TODO):

- minimum length: 10
- at least 1 letter and 1 number
- block common compromised passwords
- rate-limit repeated failed sign-ins

## Forgot Password / Reset Flow (Spec)

Not implemented yet; contract target:

### `POST /auth/password/forgot`

Request body:

```json
{ "email": "user@example.com" }
```

Response (`200` always to prevent account enumeration):

```json
{ "ok": true, "message": "If an account exists, reset instructions were sent." }
```

### `POST /auth/password/reset`

Request body:

```json
{
  "token": "<reset-token>",
  "password": "newSecurePassword123"
}
```

Response:

```json
{ "ok": true }
```

Edge cases:

- expired/invalid token: `400`
- weak password: `400`
- token replayed: `400`

## Dashboard Contract

These power Nomi Home sections.

### `GET /dashboard/summary`

```json
{
  "title": "AI summary ✨",
  "subtitle": "Generated just now",
  "body": "You captured 3 ideas and 1 links...",
  "ctaLabel": "View summary",
  "stats": {
    "noteCount": 3,
    "linkCount": 1,
    "totalCaptures": 4
  }
}
```

### `GET /dashboard/memory`

```json
{
  "title": "Resurfaced memory ✨",
  "timestamp": "2 years ago",
  "quote": "Discipline is the bridge...",
  "author": "Jim Rohn",
  "ctaLabel": "Open note"
}
```

### `GET /dashboard/recent`

```json
{
  "items": [
    {
      "id": "id",
      "title": "Design ideas for onboarding",
      "meta": "note • just now",
      "tag": "#design",
      "icon": "🗒️"
    }
  ]
}
```

### `GET /dashboard/categories`

```json
{
  "categories": [
    {
      "id": "ideas",
      "label": "Ideas",
      "count": 12,
      "icon": "💡",
      "bgColor": "#FFE6D8"
    }
  ]
}
```
