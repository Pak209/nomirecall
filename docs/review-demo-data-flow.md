# Review-Safe Demo Data Flow

Nomi now has a reusable fake-memory dataset for App Store screenshots, reviewer account setup, and Obsidian export testing.

## What It Seeds

- Six polished memories covering note, link, fictional X post, image, voice, and QA flows.
- Fictional authors and accounts only, including `@nomi_demo_lab`.
- Reserved `example.com` URLs for links and media placeholders.
- A shared `review-demo` tag so the API seeder can remove and recreate the sample set safely.
- Obsidian hub notes for `Projects/`, `Topics/`, and `Sources/`.

The source of truth is `scripts/lib/reviewDemoData.mjs`.

## Recreate the Obsidian Vault

```sh
npm run obsidian:test-vault
```

This rebuilds `obsidian-graph-test-vault/` from scratch. Open that folder in Obsidian and search Graph View for `Nomi Review Demo`.

To write somewhere else:

```sh
npm run obsidian:test-vault -- /tmp/nomi-review-demo-vault
```

## Seed a Local Review Account

Start the backend, then run:

```sh
cd backend
npm run dev
```

In another terminal:

```sh
npm run demo:seed-review
```

Defaults:

- API base: `http://localhost:3000/api`
- Email: `review-demo@example.com`
- Password: `review-demo-password`

Override them when needed:

```sh
NOMI_API_BASE="https://your-staging-host.example/api" \
NOMI_DEMO_EMAIL="review-demo@example.com" \
NOMI_DEMO_PASSWORD="use-a-real-staging-password" \
npm run demo:seed-review
```

The seeder signs in or creates the account, deletes existing memories tagged `review-demo`, then recreates the sample set through `/api/ingest`.

For native iOS/TestFlight reviewer accounts, pass a Firebase ID token so the memories are written under the Firebase Auth UID used by the app:

```sh
NOMI_API_BASE="https://your-staging-host.example/api" \
NOMI_DEMO_EMAIL="review-demo@example.com" \
NOMI_DEMO_AUTH_TOKEN="firebase-id-token" \
npm run demo:seed-review
```

## Review Safety Rules

- Do not replace the fake sample memories with real notes, real private URLs, real customer data, credentials, or secret backend URLs.
- Do not commit real App Store review account credentials.
- Keep screenshots on the sample account or the generated Obsidian vault.
- Keep product claims cautious: show capture, recall, editing, export, and connection workflows without implying authoritative AI output.

## Useful Screenshots

- Home or Recall with the `review-demo` memories visible.
- Memory detail for `Obsidian export screenshot checklist`.
- The fictional X memory `@nomi_demo_lab on X`.
- Settings export flow after the demo memories are loaded.
- Obsidian Graph View opened on `Nomi Review Demo`.
