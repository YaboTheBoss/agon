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
- **Comp mode:** chat freely for 2 days. Every 6 messages an AI referee (Gemini, `lib/tagging/`) scores the batch and awards points only for constructive messages (new reasoning, rebuttals, well-used evidence, weighing, fair concessions), with server-enforced caps: 5 per message, 12 per side per batch, and rate limits of 1 message / 3 s and 60 / hour. Tap a side of the points bar for its breakdown. When the chat ends, the side with more points wins (decided by the server) and the AI writes holistic feedback for both. Design: `docs/comp-points-design.md`.
- **Casual chats** are live for 2 days after their first message, then end (`spacetimedb/src/casual.ts`); only ended conversations get an AI summary.
- **Feed recommendations:** every pick, open, read, like, message and on-screen impression updates a private per-player taste profile (scores per category, tag, tone, mode and named entity, halving every 14 days). Each browser ranks its own feed from that profile plus popularity, freshness, live chats and queue odds, with exploration and diversity rules. "View yaaps" ranks conversations with the same profile (through their topic), using likes, unique readers, recency, live activity and length, and pushes down ones you've already read. Server: `spacetimedb/src/recommend.ts`; ranking: `lib/recommend.ts`. Design: the "yaapi feed recommendations" doc.

### Topic tagging

Topics carry 1–4 tags from one app-wide list (`TAGS` in `spacetimedb/src/recommend.ts`), a tone and named entities. New topics get keyword tags when created; right after, the app calls `POST /api/tagging`, which asks Gemini (`lib/tagging/`) for better tags and entities and submits them through `set_topic_features`. The same route writes the AI summary of each ended conversation once (`set_chat_summary`); it's also pinged when someone opens View yaaps, at most every 5 minutes. The database only accepts that call from registered service identities, and the route reads topics from the database (never from the request), so users can trigger tagging but can't influence it. Each topic is AI-tagged once; seed topics keep their hand-written tags.

One-time setup per database (shown for production):

1. Create the service identity: `curl -X POST https://maincloud.spacetimedb.com/v1/identity` → note `identity` and `token`.
2. Register it (admin only): `spacetime call yaapi grant_service '{"__identity__":"0x<identity>"}' '"ai-tagger"' --server maincloud`.
3. In Vercel, add `SPACETIMEDB_SERVICE_TOKEN=<token>` (server-only, never `NEXT_PUBLIC_`) next to `GEMINI_API_KEY`, then redeploy.

Locally, use `http://127.0.0.1:3010` and `--server http://127.0.0.1:3010 yaapi-dev`, and put the token in `.env.local`. Without these, topics simply keep their keyword tags.

After deploying this to an existing database (where `init` doesn't re-run), the admin runs `spacetime call <db> backfill_topic_features --server <server>` once to create the tag list and tag every existing topic.

After changing the competitive schema, republish with `npm run db:reset` in local development and regenerate bindings with `npm run db:generate`. Production migrations require an intentional data-migration plan rather than deleting data.

Config (optional, see `.env.example`): `NEXT_PUBLIC_SPACETIMEDB_URI`, `NEXT_PUBLIC_SPACETIMEDB_DB`.
