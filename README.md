# Yaapi — Debate Battleground

Pick a side on a topic, get paired with someone from the other side, and argue (nicely).
Next.js frontend + [SpacetimeDB](https://spacetimedb.com) backend.

## Layout

| Path | What |
|------|------|
| `app/`, `components/` | Next.js pages and UI kit |
| `lib/store.tsx` | SpacetimeDB connection + live data hooks (`useStore()`) |
| `lib/data.ts` | UI types and helpers |
| `lib/module_bindings/` | Generated client bindings — **don't edit**, run `npm run db:generate` |
| `spacetimedb/src/` | The SpacetimeDB module: tables, reducers, seed data |

## Running locally

One-time setup:

```bash
curl -sSf https://install.spacetimedb.com | sh   # installs the `spacetime` CLI
npm install
(cd spacetimedb && npm install)
```

Google sign-in (one-time):

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Create credentials → OAuth client ID** → *Web application*.
2. Authorized JavaScript origins: `http://localhost:3000` and `http://localhost` (plus your production URL later). No redirect URI needed.
3. Put the client ID in `.env.local` as `NEXT_PUBLIC_GOOGLE_CLIENT_ID=...` **and** in `GOOGLE_CLIENT_IDS` in `spacetimedb/src/auth.ts`, then `npm run db:publish`.

Then, in two terminals:

```bash
npm run db:start      # local SpacetimeDB on 127.0.0.1:3010 (keep running)
npm run db:publish    # first time, and after every change in spacetimedb/
npm run dev           # http://localhost:3000
```

The first publish seeds categories, topics, demo players and a few chats.

## Changing the backend

1. Edit `spacetimedb/src/index.ts`.
2. `npm run db:publish` (or `npm run db:reset` to wipe data and re-seed; needed for breaking schema changes).
3. `npm run db:generate` to refresh `lib/module_bindings/`.

`npm run db:logs` tails the module's logs.

## How it works

- **Sign-in:** Google. The Google ID token is the SpacetimeDB login, so the same Google account is the same player on every device (`lib/auth.tsx` on the client, `spacetimedb/src/auth.ts` on the server). Signed-out visitors connect anonymously and can browse; every write reducer requires a Google sign-in for this app's client ID.
- **Matchmaking:** `joinQueue` records your vote and pairs you with someone waiting on the other side of the same topic + mode (exact opposites first, then "Either" pickers, oldest first). If nobody's waiting you stay in the queue — even after closing the app — and get a "You got paired with another user!" notification when someone matches you. Not everyone gets paired: when one side is the big majority, some of them just wait.
- **Comp mode:** two-minute hidden openings, alternating engagement with five-minute player clocks and 90-second response clocks, 90-second hidden closings, then a multi-judge Gemini panel. Complete responses are revealed only after submission; openings and closings reveal simultaneously.

After changing the competitive schema, republish with `npm run db:reset` in local development and regenerate bindings with `npm run db:generate`. Production migrations require an intentional data-migration plan rather than deleting data.

Config (optional, see `.env.example`): `NEXT_PUBLIC_SPACETIMEDB_URI`, `NEXT_PUBLIC_SPACETIMEDB_DB`.
