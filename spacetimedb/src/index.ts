/**
 * Agon — SpacetimeDB module.
 *
 * Players pick a side on a topic → join the queue → get paired with someone
 * from the other side → chat. Not everyone gets paired: a ticket waits until
 * someone compatible picks the same topic + mode, and the waiting player gets
 * a notification when that happens. Comp (challenge) chats are scored per
 * message and end after COMP_MESSAGE_LIMIT messages. Spectators can like chats.
 *
 * Choices and sides are plain strings: side "a" | "b", choice "a" | "b" | "either",
 * mode "casual" | "comp", chat status "live" | "ended".
 */

import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { Identity } from 'spacetimedb';
import { seed } from './seed';

/* ---------------- tables ---------------- */

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    online: t.bool(),
    likes: t.u32(), // likes received across all chats
    debates: t.u32(), // chats joined
    streak: t.u32(), // consecutive active days
    lastActiveDay: t.u32(), // days since unix epoch
    membership: t.string(),
  }
);

const category = table(
  { name: 'category', public: true },
  {
    slug: t.string().primaryKey(),
    name: t.string(),
    color: t.string(),
    icon: t.string(),
    blurb: t.string(),
    sort: t.u32(),
  }
);

const topic = table(
  { name: 'topic', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    title: t.string(),
    category: t.string().index('btree'),
    sideA: t.string(),
    sideB: t.string(),
    aVotes: t.u32(),
    bVotes: t.u32(),
    eVotes: t.u32(),
    hot: t.bool(),
    createdBy: t.identity(),
    createdAt: t.timestamp(),
  }
);

const vote = table(
  {
    name: 'vote',
    public: true,
    indexes: [{ accessor: 'by_topic_voter', algorithm: 'btree', columns: ['topicId', 'voter'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    topicId: t.u64(),
    voter: t.identity(),
    choice: t.string(),
  }
);

/**
 * A player waiting for an opponent: at most one per player per topic + mode.
 * Survives disconnects; deleted when matched or when the player leaves the queue.
 */
const ticket = table(
  { name: 'ticket', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity().index('btree'),
    topicId: t.u64().index('btree'),
    choice: t.string(),
    mode: t.string(),
    createdAt: t.timestamp(),
  }
);

const chat = table(
  { name: 'chat', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    topicId: t.u64().index('btree'),
    mode: t.string(),
    a: t.identity().index('btree'),
    b: t.identity().index('btree'),
    status: t.string(),
    scoreA: t.i32(),
    scoreB: t.i32(),
    likes: t.u32(),
    msgCount: t.u32(),
    summary: t.string(),
    createdAt: t.timestamp(),
    lastAt: t.timestamp(),
  }
);

const message = table(
  { name: 'message', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    chatId: t.u64().index('btree'),
    sender: t.identity(),
    side: t.string(),
    text: t.string(),
    pts: t.i32().optional(), // comp only
    why: t.string().optional(), // comp only
    sentAt: t.timestamp(),
  }
);

const chatLike = table(
  {
    name: 'chat_like',
    public: true,
    indexes: [{ accessor: 'by_chat_liker', algorithm: 'btree', columns: ['chatId', 'liker'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    chatId: t.u64(),
    liker: t.identity(),
  }
);

/** "You got paired" alerts. Only visible to their recipient (see filter below). */
const notification = table(
  { name: 'notification', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    recipient: t.identity().index('btree'),
    chatId: t.u64(),
    topicId: t.u64(),
    text: t.string(),
    createdAt: t.timestamp(),
  }
);

const spacetimedb = schema({ player, category, topic, vote, ticket, chat, message, chatLike, notification });
export default spacetimedb;

export const ownNotifications = spacetimedb.clientVisibilityFilter.sql('SELECT * FROM notification WHERE recipient = :sender');

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

/* ---------------- constants + helpers ---------------- */

const COMP_MESSAGE_LIMIT = 12;
const MICROS_PER_DAY = 86_400_000_000n;

const GUEST_ADJ = ['Bold', 'Witty', 'Calm', 'Sharp', 'Sunny', 'Brave', 'Clever', 'Lucky', 'Swift', 'Quiet'];
const GUEST_NOUN = ['Otter', 'Falcon', 'Panda', 'Fox', 'Koala', 'Heron', 'Lynx', 'Moose', 'Gecko', 'Owl'];

// TODO: replace with an AI moderator procedure. Rough keyword scoring for now.
function scoreArgument(text: string): { pts: number; why: string } {
  if (/\b(stupid|idiot|dumb|clown|loser)\b/i.test(text)) return { pts: -6, why: 'Personal attack' };
  if (/\b(fair point|you're right|i agree|to be fair|good point|i see your point)\b/i.test(text)) return { pts: 11, why: 'Steelman' };
  if (/\b(because|since|evidence|study|source|data|for example|e\.g\.)\b/i.test(text)) return { pts: text.length > 80 ? 10 : 8, why: 'Reasoning' };
  if (text.trim().endsWith('?')) return { pts: 4, why: 'Good question' };
  return { pts: text.length > 80 ? 6 : 3, why: 'Point made' };
}

function isSide(s: string): s is 'a' | 'b' {
  return s === 'a' || s === 'b';
}

function otherSide(s: string): 'a' | 'b' {
  return s === 'a' ? 'b' : 'a';
}

function requirePlayer(ctx: Ctx) {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (!p) throw new SenderError('Unknown player');
  return p;
}

function bumpVotes(ctx: Ctx, topicId: bigint, choice: string, delta: 1 | -1) {
  const tp = ctx.db.topic.id.find(topicId);
  if (!tp) return;
  const add = (n: number) => Math.max(0, n + delta);
  ctx.db.topic.id.update({
    ...tp,
    aVotes: choice === 'a' ? add(tp.aVotes) : tp.aVotes,
    bVotes: choice === 'b' ? add(tp.bVotes) : tp.bVotes,
    eVotes: choice === 'either' ? add(tp.eVotes) : tp.eVotes,
  });
}

/** Record (or change) the sender's pick on a topic and keep the topic's tallies in sync. */
function castVote(ctx: Ctx, topicId: bigint, choice: string) {
  const existing = [...ctx.db.vote.by_topic_voter.filter([topicId, ctx.sender])][0];
  if (existing) {
    if (existing.choice === choice) return;
    bumpVotes(ctx, topicId, existing.choice, -1);
    ctx.db.vote.id.update({ ...existing, choice });
  } else {
    ctx.db.vote.insert({ id: 0n, topicId, voter: ctx.sender, choice });
  }
  bumpVotes(ctx, topicId, choice, 1);
}

/** "Either" goes to whichever side has fewer votes. */
function sideForEither(ctx: Ctx, topicId: bigint): 'a' | 'b' {
  const tp = ctx.db.topic.id.find(topicId);
  return tp && tp.aVotes >= tp.bVotes ? 'b' : 'a';
}

function createChat(ctx: Ctx, topicId: bigint, mode: string, a: Identity, b: Identity) {
  const row = ctx.db.chat.insert({
    id: 0n,
    topicId,
    mode,
    a,
    b,
    status: 'live',
    scoreA: 0,
    scoreB: 0,
    likes: 0,
    msgCount: 0,
    summary: '',
    createdAt: ctx.timestamp,
    lastAt: ctx.timestamp,
  });
  for (const who of [a, b]) {
    const p = ctx.db.player.identity.find(who);
    if (p) ctx.db.player.identity.update({ ...p, debates: p.debates + 1 });
  }
  return row;
}

function touchStreak(ctx: Ctx, who: Identity) {
  const p = ctx.db.player.identity.find(who);
  if (!p) return;
  const today = Number(ctx.timestamp.microsSinceUnixEpoch / MICROS_PER_DAY);
  if (today === p.lastActiveDay) return;
  const streak = today === p.lastActiveDay + 1 ? p.streak + 1 : 1;
  ctx.db.player.identity.update({ ...p, streak, lastActiveDay: today });
}

/** Append a message, score it in comp mode, and end comp chats at the limit. */
function postMessage(ctx: Ctx, chatId: bigint, sender: Identity, text: string) {
  const c = ctx.db.chat.id.find(chatId);
  if (!c) return;
  const side = c.a.isEqual(sender) ? 'a' : 'b';
  const comp = c.mode === 'comp';
  const scored = comp ? scoreArgument(text) : undefined;

  ctx.db.message.insert({
    id: 0n,
    chatId,
    sender,
    side,
    text,
    pts: scored?.pts,
    why: scored?.why,
    sentAt: ctx.timestamp,
  });

  const msgCount = c.msgCount + 1;
  ctx.db.chat.id.update({
    ...c,
    msgCount,
    lastAt: ctx.timestamp,
    scoreA: side === 'a' && scored ? Math.max(0, c.scoreA + scored.pts) : c.scoreA,
    scoreB: side === 'b' && scored ? Math.max(0, c.scoreB + scored.pts) : c.scoreB,
    status: comp && msgCount >= COMP_MESSAGE_LIMIT ? 'ended' : c.status,
  });
  touchStreak(ctx, sender);
}

/* ---------------- lifecycle ---------------- */

export const init = spacetimedb.init(ctx => {
  seed(ctx);
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) {
    ctx.db.player.identity.update({ ...p, online: true });
    return;
  }
  const name = `${GUEST_ADJ[ctx.random.integerInRange(0, GUEST_ADJ.length - 1)]} ${GUEST_NOUN[ctx.random.integerInRange(0, GUEST_NOUN.length - 1)]}`;
  ctx.db.player.insert({
    identity: ctx.sender,
    name,
    online: true,
    likes: 0,
    debates: 0,
    streak: 0,
    lastActiveDay: 0,
    membership: 'Free',
  });
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) ctx.db.player.identity.update({ ...p, online: false });
  // Tickets stay: you can still get paired while away and see it next visit.
});

/* ---------------- reducers ---------------- */

export const setName = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 24) throw new SenderError('Names must be 2–24 characters');
  const p = requirePlayer(ctx);
  ctx.db.player.identity.update({ ...p, name: trimmed });
});

export const createTopic = spacetimedb.reducer(
  { title: t.string(), sideA: t.string(), sideB: t.string(), category: t.string() },
  (ctx, args) => {
    requirePlayer(ctx);
    const title = args.title.trim();
    const sideA = args.sideA.trim() || 'Yes';
    const sideB = args.sideB.trim() || 'No';
    if (!title || title.length > 120) throw new SenderError('The question must be 1–120 characters');
    if (sideA.length > 20 || sideB.length > 20) throw new SenderError('Side names must be 20 characters or less');
    if (!ctx.db.category.slug.find(args.category)) throw new SenderError('Unknown category');
    ctx.db.topic.insert({
      id: 0n,
      title,
      category: args.category,
      sideA,
      sideB,
      aVotes: 0,
      bVotes: 0,
      eVotes: 0,
      hot: false,
      createdBy: ctx.sender,
      createdAt: ctx.timestamp,
    });
  }
);

/**
 * Pick a side and look for an opponent on the same topic + mode.
 *
 * Exact opposites are preferred over "Either" pickers (who stay free to fill
 * whichever side is short), then the longest-waiting ticket wins. When the
 * majority side outnumbers the other, some players simply stay in the queue
 * until someone compatible shows up — that's expected.
 */
export const joinQueue = spacetimedb.reducer(
  { topicId: t.u64(), choice: t.string(), mode: t.string() },
  (ctx, { topicId, choice, mode }) => {
    requirePlayer(ctx);
    const tp = ctx.db.topic.id.find(topicId);
    if (!tp) throw new SenderError('Unknown topic');
    if (choice !== 'a' && choice !== 'b' && choice !== 'either') throw new SenderError('Bad choice');
    if (mode !== 'casual' && mode !== 'comp') throw new SenderError('Bad mode');

    castVote(ctx, topicId, choice);

    const waiting = [...ctx.db.ticket.topicId.filter(topicId)].filter(w => w.mode === mode);
    // Re-picking replaces your old ticket for this topic + mode.
    for (const w of waiting) if (w.identity.isEqual(ctx.sender)) ctx.db.ticket.id.delete(w.id);

    // Don't pair the same two people twice on a topic while they still have a live chat.
    const alreadyFacing = new Set(
      [...ctx.db.chat.topicId.filter(topicId)]
        .filter(c => c.status === 'live' && (c.a.isEqual(ctx.sender) || c.b.isEqual(ctx.sender)))
        .map(c => (c.a.isEqual(ctx.sender) ? c.b : c.a).toHexString())
    );
    const rank = (w: { choice: string }) => (w.choice !== 'either' ? 0 : 1);
    const other = waiting
      .filter(w => !w.identity.isEqual(ctx.sender) && !alreadyFacing.has(w.identity.toHexString()))
      .filter(w => choice === 'either' || w.choice === 'either' || w.choice !== choice)
      .sort((x, y) => rank(x) - rank(y) || (x.createdAt.microsSinceUnixEpoch < y.createdAt.microsSinceUnixEpoch ? -1 : 1))[0];

    if (!other) {
      ctx.db.ticket.insert({ id: 0n, identity: ctx.sender, topicId, choice, mode, createdAt: ctx.timestamp });
      return;
    }

    const mySide: 'a' | 'b' = isSide(choice)
      ? choice
      : isSide(other.choice)
        ? otherSide(other.choice)
        : sideForEither(ctx, topicId);
    const c = createChat(ctx, topicId, mode, mySide === 'a' ? ctx.sender : other.identity, mySide === 'a' ? other.identity : ctx.sender);
    ctx.db.ticket.id.delete(other.id);
    ctx.db.notification.insert({
      id: 0n,
      recipient: other.identity,
      chatId: c.id,
      topicId,
      text: 'You got paired with another user!',
      createdAt: ctx.timestamp,
    });
  }
);

export const leaveQueue = spacetimedb.reducer({ ticketId: t.u64() }, (ctx, { ticketId }) => {
  const tk = ctx.db.ticket.id.find(ticketId);
  if (tk && tk.identity.isEqual(ctx.sender)) ctx.db.ticket.id.delete(ticketId);
});

/** Clear your notifications for a chat (opened it, or dismissed the alert). */
export const dismissNotifications = spacetimedb.reducer({ chatId: t.u64() }, (ctx, { chatId }) => {
  for (const n of [...ctx.db.notification.recipient.filter(ctx.sender)]) {
    if (n.chatId === chatId) ctx.db.notification.id.delete(n.id);
  }
});

export const sendMessage = spacetimedb.reducer({ chatId: t.u64(), text: t.string() }, (ctx, { chatId, text }) => {
  const body = text.trim();
  if (!body) throw new SenderError('Message is empty');
  if (body.length > 500) throw new SenderError('Message is too long');
  const c = ctx.db.chat.id.find(chatId);
  if (!c) throw new SenderError('Unknown chat');
  const mine = c.a.isEqual(ctx.sender) || c.b.isEqual(ctx.sender);
  if (!mine) throw new SenderError('You are not in this chat');
  if (c.status === 'ended') throw new SenderError('This challenge has ended');

  if (c.mode === 'comp') {
    // Comp is strictly turn-based so both sides get the same number of scored turns.
    const last = [...ctx.db.message.chatId.filter(chatId)].sort((x, y) =>
      x.sentAt.microsSinceUnixEpoch < y.sentAt.microsSinceUnixEpoch ? -1 : 1
    ).at(-1);
    if (last && last.sender.isEqual(ctx.sender)) throw new SenderError("Wait for your opponent's reply");
  }

  postMessage(ctx, chatId, ctx.sender, body);
});

export const toggleLike = spacetimedb.reducer({ chatId: t.u64() }, (ctx, { chatId }) => {
  requirePlayer(ctx);
  const c = ctx.db.chat.id.find(chatId);
  if (!c) throw new SenderError('Unknown chat');
  const existing = [...ctx.db.chatLike.by_chat_liker.filter([chatId, ctx.sender])][0];
  const delta = existing ? -1 : 1;
  if (existing) ctx.db.chatLike.id.delete(existing.id);
  else ctx.db.chatLike.insert({ id: 0n, chatId, liker: ctx.sender });

  ctx.db.chat.id.update({ ...c, likes: Math.max(0, c.likes + delta) });
  for (const who of [c.a, c.b]) {
    const p = ctx.db.player.identity.find(who);
    if (p) ctx.db.player.identity.update({ ...p, likes: Math.max(0, p.likes + delta) });
  }
});
