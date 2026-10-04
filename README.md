# Agon — Debate Battleground

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

- **Identity:** each browser gets an anonymous SpacetimeDB identity (token in `localStorage`) and a random name, editable on the profile page.
- **Matchmaking:** `joinQueue` records your vote and pairs you with someone waiting on the other side of the same topic + mode (exact opposites first, then "Either" pickers, oldest first). If nobody's waiting you stay in the queue — even after closing the app — and get a "You got paired with another user!" notification when someone matches you. Not everyone gets paired: when one side is the big majority, some of them just wait.
- **Comp mode:** turn-based, each message is scored server-side (keyword heuristic for now — an AI moderator is the planned upgrade), and the chat ends after 12 messages.

Config (optional, see `.env.example`): `NEXT_PUBLIC_SPACETIMEDB_URI`, `NEXT_PUBLIC_SPACETIMEDB_DB`.
