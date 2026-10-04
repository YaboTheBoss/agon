/**
 * Yaapi — SpacetimeDB module.
 *
 * Players pick a side on a topic → join the queue → get paired with someone
 * from the other side → chat. Not everyone gets paired: a ticket waits until
 * someone compatible picks the same topic + mode, and the waiting player gets
 * a notification when that happens. Comp (challenge) chats are scored per
 * a phased, timed debate. Spectators can like chats.
 *
 * Choices and sides are plain strings: side "a" | "b", choice "a" | "b" | "either",
 * mode "casual" | "comp", chat status "live" | "ended".
 */

import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { Identity } from 'spacetimedb';
import { removeDemoData as removeDemo, seed } from './seed';
import { classifyLogin } from './auth';

/* ---------------- tables ---------------- */

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(), // display name
    username: t.string(), // lowercase handle; "" until the profile is set up
    online: t.bool(),
    likes: t.u32(), // likes received across all chats
    debates: t.u32(), // chats joined
    streak: t.u32(), // consecutive active days
    lastActiveDay: t.u32(), // days since unix epoch
    membership: t.string(),
  }
);

/** Who may run admin reducers: the identity that first published the database. Private. */
const admin = table(
  { name: 'admin' },
  {
    identity: t.identity().primaryKey(),
  }
);

/** Claimed usernames. The primary key is what makes them unique. */
const username = table(
  { name: 'username', public: true },
  {
    name: t.string().primaryKey(), // lowercase
    owner: t.identity().unique(),
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
    phase: t.string(),
    phaseStartedAt: t.timestamp(),
    engagementStarter: t.string(),
    currentTurn: t.string(),
    remainingA: t.u64(),
    remainingB: t.u64(),
    openingA: t.bool(),
    openingB: t.bool(),
    closingA: t.bool(),
    closingB: t.bool(),
    yieldedSide: t.string(),
    passesA: t.u32(),
    passesB: t.u32(),
    resultJson: t.string(),
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
    phase: t.string(),
    sentAt: t.timestamp(),
  }
);

/** Hidden simultaneous opening/closing statements. */
const submission = table(
  { name: 'submission' },
  {
    id: t.u64().primaryKey().autoInc(),
    chatId: t.u64().index('btree'),
    side: t.string(),
    phase: t.string(),
    text: t.string(),
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

const spacetimedb = schema({ player, admin, username, category, topic, vote, ticket, chat, message, submission, chatLike, notification });
export default spacetimedb;

export const ownNotifications = spacetimedb.clientVisibilityFilter.sql('SELECT * FROM notification WHERE recipient = :sender');

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

/* ---------------- constants + helpers ---------------- */

const MICROS_PER_DAY = 86_400_000_000n;
const OPENING_MICROS = 120_000_000n;
const RESPONSE_MICROS = 90_000_000n;
const ENGAGEMENT_MICROS = 300_000_000n;
const CLOSING_MICROS = 90_000_000n;
type ChatRow = NonNullable<ReturnType<Ctx['db']['chat']['id']['find']>>;

function isSide(s: string): s is 'a' | 'b' {
  return s === 'a' || s === 'b';
}

function otherSide(s: string): 'a' | 'b' {
  return s === 'a' ? 'b' : 'a';
}

/** Every write needs a signed-in (Google) player. */
function requirePlayer(ctx: Ctx) {
  if (classifyLogin(ctx.senderAuth.jwt).kind !== 'google') throw new SenderError('Sign in with Google first');
  const p = ctx.db.player.identity.find(ctx.sender);
  if (!p) throw new SenderError('Unknown player');
  return p;
}

/** Playing (queueing, chatting, liking, posting) also needs a finished profile. */
function requireProfile(ctx: Ctx) {
  const p = requirePlayer(ctx);
  if (!p.username) throw new SenderError('Finish setting up your profile first');
  return p;
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const RESERVED_USERNAMES = new Set(['admin', 'yaapi', 'support', 'help', 'mod', 'moderator', 'system', 'me', 'you', 'null', 'undefined']);

function cleanDisplayName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 24) throw new SenderError('Display names must be 2–24 characters');
  return trimmed;
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
  const starter = ctx.random() < 0.5 ? 'a' : 'b';
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
    phase: mode === 'comp' ? 'opening' : 'casual',
    phaseStartedAt: ctx.timestamp,
    engagementStarter: starter,
    currentTurn: starter,
    remainingA: ENGAGEMENT_MICROS,
    remainingB: ENGAGEMENT_MICROS,
    openingA: false,
    openingB: false,
    closingA: false,
    closingB: false,
    yieldedSide: '',
    passesA: 0,
    passesB: 0,
    resultJson: '',
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

function insertMessage(ctx: Ctx, chatId: bigint, sender: Identity, side: 'a' | 'b', text: string, phase: string) {
  ctx.db.message.insert({ id: 0n, chatId, sender, side, text, pts: undefined, why: undefined, phase, sentAt: ctx.timestamp });
}

function sideIdentity(c: ChatRow, side: string) { return side === 'a' ? c.a : c.b; }
function elapsed(ctx: Ctx, c: ChatRow) { return ctx.timestamp.microsSinceUnixEpoch - c.phaseStartedAt.microsSinceUnixEpoch; }

function revealStatements(ctx: Ctx, c: ChatRow, phase: 'opening' | 'closing') {
  const rows = [...ctx.db.submission.chatId.filter(c.id)].filter(s => s.phase === phase);
  for (const side of ['a', 'b'] as const) {
    const row = rows.find(s => s.side === side);
    if (row) insertMessage(ctx, c.id, sideIdentity(c, side), side, row.text, phase);
  }
  for (const row of rows) ctx.db.submission.id.delete(row.id);
  return rows.length;
}

function beginEngagement(ctx: Ctx, c: ChatRow) {
  const revealed = revealStatements(ctx, c, 'opening');
  ctx.db.chat.id.update({ ...c, msgCount: c.msgCount + revealed, phase: 'engagement', currentTurn: c.engagementStarter, phaseStartedAt: ctx.timestamp });
}

function beginClosing(ctx: Ctx, c: ChatRow) {
  ctx.db.chat.id.update({ ...c, phase: 'closing', currentTurn: '', phaseStartedAt: ctx.timestamp });
}

function beginJudging(ctx: Ctx, c: ChatRow) {
  const revealed = revealStatements(ctx, c, 'closing');
  ctx.db.chat.id.update({ ...c, msgCount: c.msgCount + revealed, phase: 'judging', currentTurn: '', phaseStartedAt: ctx.timestamp });
}

function useTurnTime(ctx: Ctx, c: ChatRow, side: 'a' | 'b') {
  const used = elapsed(ctx, c);
  const remaining = side === 'a' ? c.remainingA : c.remainingB;
  return remaining > used ? remaining - used : 0n;
}

function finishEngagementTurn(ctx: Ctx, c: ChatRow, side: 'a' | 'b', passed: boolean) {
  const remaining = useTurnTime(ctx, c, side);
  const passes = (side === 'a' ? c.passesA : c.passesB) + (passed ? 1 : 0);
  const yielded = remaining === 0n || passes >= 2 ? side : c.yieldedSide;
  const update: ChatRow = {
    ...c,
    remainingA: side === 'a' ? remaining : c.remainingA,
    remainingB: side === 'b' ? remaining : c.remainingB,
    passesA: side === 'a' ? (passed ? passes : 0) : c.passesA,
    passesB: side === 'b' ? (passed ? passes : 0) : c.passesB,
    yieldedSide: yielded,
    currentTurn: otherSide(side),
    phaseStartedAt: ctx.timestamp,
  };
  if (c.yieldedSide && side !== c.yieldedSide) beginClosing(ctx, update);
  else ctx.db.chat.id.update(update);
}

/** Append a casual message or a public engagement response. */
function postMessage(ctx: Ctx, chatId: bigint, sender: Identity, text: string) {
  const c = ctx.db.chat.id.find(chatId);
  if (!c) return;
  const side = c.a.isEqual(sender) ? 'a' : 'b';
  insertMessage(ctx, chatId, sender, side, text, c.mode === 'comp' ? 'engagement' : 'casual');
  const updated: ChatRow = { ...c, msgCount: c.msgCount + 1, lastAt: ctx.timestamp };
  if (c.mode === 'comp') finishEngagementTurn(ctx, updated, side, false);
  else ctx.db.chat.id.update(updated);
  touchStreak(ctx, sender);
}

/* ---------------- lifecycle ---------------- */

export const init = spacetimedb.init(ctx => {
  // The publisher becomes the admin.
  ctx.db.admin.insert({ identity: ctx.sender });
  seed(ctx);
});

/**
 * Google users get a player row (named from their Google profile the first
 * time). Anonymous visitors may connect to browse but get no player row.
 * A Google token minted for some other app is rejected outright.
 */
export const onConnect = spacetimedb.clientConnected(ctx => {
  const login = classifyLogin(ctx.senderAuth.jwt);
  if (login.kind === 'other-google') throw new SenderError('This Google sign-in is not for this app');
  if (login.kind === 'anonymous') return;

  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) {
    ctx.db.player.identity.update({ ...p, online: true });
    return;
  }
  ctx.db.player.insert({
    identity: ctx.sender,
    name: login.user.name,
    username: '',
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
  const p = requirePlayer(ctx);
  ctx.db.player.identity.update({ ...p, name: cleanDisplayName(name) });
});

/**
 * First-time setup after signing in: claim a username and pick a display name.
 * Usernames are lowercase letters, numbers and underscores, 3–20 long, and
 * can't be changed here once set.
 */
export const completeProfile = spacetimedb.reducer(
  { username: t.string(), displayName: t.string() },
  (ctx, args) => {
    const p = requirePlayer(ctx);
    if (p.username) throw new SenderError('Your profile is already set up');
    const handle = args.username.trim().replace(/^@/, '').toLowerCase();
    if (!USERNAME_RE.test(handle)) throw new SenderError('Usernames are 3–20 letters, numbers or underscores');
    if (RESERVED_USERNAMES.has(handle)) throw new SenderError('That username is reserved');
    if (ctx.db.username.name.find(handle)) throw new SenderError('That username is taken');
    const name = cleanDisplayName(args.displayName);
    ctx.db.username.insert({ name: handle, owner: ctx.sender });
    ctx.db.player.identity.update({ ...p, name, username: handle });
  }
);

export const createTopic = spacetimedb.reducer(
  { title: t.string(), sideA: t.string(), sideB: t.string(), category: t.string() },
  (ctx, args) => {
    requireProfile(ctx);
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
    requireProfile(ctx);
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
  requirePlayer(ctx);
  const tk = ctx.db.ticket.id.find(ticketId);
  if (tk && tk.identity.isEqual(ctx.sender)) ctx.db.ticket.id.delete(ticketId);
});

/** Clear your notifications for a chat (opened it, or dismissed the alert). */
export const dismissNotifications = spacetimedb.reducer({ chatId: t.u64() }, (ctx, { chatId }) => {
  requirePlayer(ctx);
  for (const n of [...ctx.db.notification.recipient.filter(ctx.sender)]) {
    if (n.chatId === chatId) ctx.db.notification.id.delete(n.id);
  }
});

export const sendMessage = spacetimedb.reducer({ chatId: t.u64(), text: t.string() }, (ctx, { chatId, text }) => {
  requireProfile(ctx);
  const body = text.trim();
  if (!body) throw new SenderError('Message is empty');
  const c = ctx.db.chat.id.find(chatId);
  if (!c) throw new SenderError('Unknown chat');
  const maxLength = c.mode === 'comp' && (c.phase === 'opening' || c.phase === 'closing') ? 6_000 : 500;
  if (body.length > maxLength) throw new SenderError('Message is too long');
  const mine = c.a.isEqual(ctx.sender) || c.b.isEqual(ctx.sender);
  if (!mine) throw new SenderError('You are not in this chat');
  if (c.status === 'ended') throw new SenderError('This debate has ended');

  if (c.mode === 'comp') {
    const side = c.a.isEqual(ctx.sender) ? 'a' : 'b';
    if (c.phase === 'opening' || c.phase === 'closing') {
      const already = c.phase === 'opening'
        ? (side === 'a' ? c.openingA : c.openingB)
        : (side === 'a' ? c.closingA : c.closingB);
      if (already) throw new SenderError(`Your ${c.phase} is already submitted`);
      ctx.db.submission.insert({ id: 0n, chatId, side, phase: c.phase, text: body });
      const updated: ChatRow = {
        ...c,
        openingA: c.phase === 'opening' && side === 'a' ? true : c.openingA,
        openingB: c.phase === 'opening' && side === 'b' ? true : c.openingB,
        closingA: c.phase === 'closing' && side === 'a' ? true : c.closingA,
        closingB: c.phase === 'closing' && side === 'b' ? true : c.closingB,
        lastAt: ctx.timestamp,
      };
      if (updated.openingA && updated.openingB && c.phase === 'opening') beginEngagement(ctx, updated);
      else if (updated.closingA && updated.closingB && c.phase === 'closing') beginJudging(ctx, updated);
      else ctx.db.chat.id.update(updated);
      return;
    }
    if (c.phase !== 'engagement') throw new SenderError('Wait for the next phase');
    if (c.currentTurn !== side) throw new SenderError("Wait for your opponent's reply");
  }

  postMessage(ctx, chatId, ctx.sender, body);
});

export const passTurn = spacetimedb.reducer({ chatId: t.u64() }, (ctx, { chatId }) => {
  requireProfile(ctx);
  const c = ctx.db.chat.id.find(chatId);
  if (!c || c.mode !== 'comp' || c.phase !== 'engagement') throw new SenderError('Not in engagement');
  const side = c.a.isEqual(ctx.sender) ? 'a' : c.b.isEqual(ctx.sender) ? 'b' : '';
  if (!side || c.currentTurn !== side) throw new SenderError('It is not your turn');
  finishEngagementTurn(ctx, c, side, true);
});

export const yieldEngagement = spacetimedb.reducer({ chatId: t.u64() }, (ctx, { chatId }) => {
  requireProfile(ctx);
  const c = ctx.db.chat.id.find(chatId);
  if (!c || c.mode !== 'comp' || c.phase !== 'engagement') throw new SenderError('Not in engagement');
  const side = c.a.isEqual(ctx.sender) ? 'a' : c.b.isEqual(ctx.sender) ? 'b' : '';
  if (!side || c.currentTurn !== side) throw new SenderError('It is not your turn');
  ctx.db.chat.id.update({ ...c, yieldedSide: side, currentTurn: otherSide(side), phaseStartedAt: ctx.timestamp });
});

/** Advances expired phases. Clients call this periodically; server time is authoritative. */
export const advanceMatch = spacetimedb.reducer({ chatId: t.u64() }, (ctx, { chatId }) => {
  requireProfile(ctx);
  const c = ctx.db.chat.id.find(chatId);
  if (!c || c.mode !== 'comp' || c.status === 'ended') return;
  if (!c.a.isEqual(ctx.sender) && !c.b.isEqual(ctx.sender)) throw new SenderError('You are not in this chat');
  const used = elapsed(ctx, c);
  if (c.phase === 'opening' && used >= OPENING_MICROS) beginEngagement(ctx, c);
  else if (c.phase === 'closing' && used >= CLOSING_MICROS) beginJudging(ctx, c);
  else if (c.phase === 'engagement') {
    const side = c.currentTurn as 'a' | 'b';
    const remaining = side === 'a' ? c.remainingA : c.remainingB;
    if (used >= RESPONSE_MICROS || used >= remaining) finishEngagementTurn(ctx, c, side, true);
  }
});

/** Stores the signed-in participant's server-produced judging response. */
export const submitJudgingResult = spacetimedb.reducer(
  { chatId: t.u64(), resultJson: t.string() },
  (ctx, { chatId, resultJson }) => {
    requireProfile(ctx);
    const c = ctx.db.chat.id.find(chatId);
    if (!c || c.phase !== 'judging' || c.resultJson) throw new SenderError('This debate is not awaiting a result');
    if (!c.a.isEqual(ctx.sender) && !c.b.isEqual(ctx.sender)) throw new SenderError('You are not in this chat');
    if (resultJson.length > 1_000_000) throw new SenderError('Result is too large');
    JSON.parse(resultJson);
    ctx.db.chat.id.update({ ...c, resultJson, phase: 'ended', status: 'ended', lastAt: ctx.timestamp });
  }
);

export const toggleLike = spacetimedb.reducer({ chatId: t.u64() }, (ctx, { chatId }) => {
  requireProfile(ctx);
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

/* ---------------- admin ---------------- */

/**
 * Deletes the seeded demo players, chats and made-up vote counts; keeps
 * categories, topics and everything real. Admin only:
 *   spacetime call <db> remove_demo_data --server <server>
 */
export const removeDemoData = spacetimedb.reducer(ctx => {
  if (!ctx.db.admin.identity.find(ctx.sender)) throw new SenderError('Admins only');
  if (!removeDemo(ctx)) throw new SenderError('Demo data was already removed');
  console.info('Demo data removed');
});
