/**
 * Yaapi — SpacetimeDB module.
 *
 * Players pick a side on a topic → join the queue → get paired with someone
 * from the other side → chat. Not everyone gets paired: a ticket waits until
 * someone compatible picks the same topic + mode, and the waiting player gets
 * a notification when that happens. Chats are live for 2 days from their
 * first message (casual.ts). In comp chats the AI scores every 6 messages and
 * the side with more points at the end wins (points.ts). Spectators can like chats.
 *
 * Choices and sides are plain strings: side "a" | "b", choice "a" | "b" | "either",
 * mode "casual" | "comp", chat status "live" | "ended".
 */

import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { Identity, ScheduleAt } from 'spacetimedb';
import { removeDemoData as removeDemo, seed } from './seed';
import { classifyLogin } from './auth';
import {
  EntityInput,
  PRUNE_EVERY_MICROS,
  TAG_SLUGS,
  affinity,
  applyTopicFeatures,
  backfillFeatures,
  chatStats,
  convoMemory,
  entity,
  interaction,
  pruneInteractions,
  pruneJob,
  recordConvoEvent,
  recordEvent,
  seedInterests,
  service,
  tag,
  tagTopic,
  topicEntity,
  topicMemory,
  topicMeta,
  topicTag,
} from './recommend';
import { CASUAL_SWEEP_EVERY_MICROS, casualClock, casualExpired, casualSweepJob, startCasualClock, sweepCasualChats } from './casual';
import { AwardInput, applyAwards, finalizeResult, pointAward, scoreState, startScoring } from './points';

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

const spacetimedb = schema({
  player, admin, username, category, topic, vote, ticket, chat, message, submission, chatLike, notification,
  // feed recommendations (recommend.ts)
  tag, topicTag, topicMeta, entity, topicEntity, interaction, affinity, topicMemory, service, pruneJob,
  convoMemory, chatStats,
  // casual chat lifetime (casual.ts)
  casualClock, casualSweepJob,
  // comp points (points.ts)
  pointAward, scoreState,
});
export default spacetimedb;

export const ownNotifications = spacetimedb.clientVisibilityFilter.sql('SELECT * FROM notification WHERE recipient = :sender');
// Taste profiles are private: each player receives only their own rows.
export const ownAffinity = spacetimedb.clientVisibilityFilter.sql('SELECT * FROM affinity WHERE owner = :sender');
export const ownTopicMemory = spacetimedb.clientVisibilityFilter.sql('SELECT * FROM topic_memory WHERE owner = :sender');
export const ownConvoMemory = spacetimedb.clientVisibilityFilter.sql('SELECT * FROM convo_memory WHERE owner = :sender');

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

/* ---------------- constants + helpers ---------------- */

const MICROS_PER_DAY = 86_400_000_000n;
/** Anti-flood limits per player per chat (also bound how often comp chats get scored). */
const MIN_MESSAGE_GAP_MICROS = 3_000_000n;
const MAX_MESSAGES_PER_HOUR = 60;
const HOUR_MICROS = 3_600_000_000n;
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
    phase: mode,
    phaseStartedAt: ctx.timestamp,
    engagementStarter: starter,
    currentTurn: starter,
    remainingA: 0n,
    remainingB: 0n,
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
  if (mode === 'comp') startScoring(ctx, row.id);
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

/** Append a message (casual or comp: both chat freely). */
function postMessage(ctx: Ctx, chatId: bigint, sender: Identity, text: string) {
  const c = ctx.db.chat.id.find(chatId);
  if (!c) return;
  const side = c.a.isEqual(sender) ? 'a' : 'b';
  insertMessage(ctx, chatId, sender, side, text, c.mode);
  ctx.db.chat.id.update({ ...c, msgCount: c.msgCount + 1, lastAt: ctx.timestamp });
  touchStreak(ctx, sender);
}

/** Refuse floods: one message every 3 s and at most 60 an hour per player per chat. */
function checkRate(ctx: Ctx, chatId: bigint) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  let lastHour = 0;
  for (const m of ctx.db.message.chatId.filter(chatId)) {
    if (!m.sender.isEqual(ctx.sender)) continue;
    const ago = now - m.sentAt.microsSinceUnixEpoch;
    if (ago < MIN_MESSAGE_GAP_MICROS) throw new SenderError('Slow down a little');
    if (ago < HOUR_MICROS) lastHour++;
  }
  if (lastHour >= MAX_MESSAGES_PER_HOUR) throw new SenderError('Message limit reached for this hour');
}

function requireService(ctx: Ctx) {
  if (!ctx.db.service.identity.find(ctx.sender)) throw new SenderError('Only the AI service may do this');
}

/* ---------------- lifecycle ---------------- */

/** Count this message toward the taste profile (first 4 of a chat only). */
function noteMessage(ctx: Ctx, c: ChatRow) {
  const sent = [...ctx.db.message.chatId.filter(c.id)].filter(m => m.sender.isEqual(ctx.sender)).length;
  if (sent <= 4) recordEvent(ctx, ctx.sender, c.topicId, 'message', { mode: c.mode });
}

/** Make sure the daily interaction-pruning job exists (init only runs on a fresh database). */
function ensurePruneJob(ctx: Ctx) {
  if ([...ctx.db.pruneJob.iter()].length === 0) {
    ctx.db.pruneJob.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(PRUNE_EVERY_MICROS) });
  }
  // Same "init only runs on a fresh database" reason for the casual-chat sweep.
  if ([...ctx.db.casualSweepJob.iter()].length === 0) {
    ctx.db.casualSweepJob.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(CASUAL_SWEEP_EVERY_MICROS) });
  }
}

function requireAdmin(ctx: Ctx) {
  if (!ctx.db.admin.identity.find(ctx.sender)) throw new SenderError('Admins only');
}

export const init = spacetimedb.init(ctx => {
  // The publisher becomes the admin.
  ctx.db.admin.insert({ identity: ctx.sender });
  seed(ctx);
  backfillFeatures(ctx);
  ensurePruneJob(ctx);
});

/**
 * Google users get a player row (named from their Google profile the first
 * time). Anonymous visitors may connect to browse but get no player row.
 * A Google token minted for some other app is rejected outright.
 */
export const onConnect = spacetimedb.clientConnected(ctx => {
  ensurePruneJob(ctx);
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
    const row = ctx.db.topic.insert({
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
    // Keyword tags now; the AI tagging service may replace them via setTopicFeatures.
    tagTopic(ctx, row.id);
    recordEvent(ctx, ctx.sender, row.id, 'create');
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

    // A first pick on a topic counts toward the taste profile; re-picks don't.
    const firstPick = [...ctx.db.vote.by_topic_voter.filter([topicId, ctx.sender])].length === 0;
    castVote(ctx, topicId, choice);
    if (firstPick) recordEvent(ctx, ctx.sender, topicId, 'pick', { mode });

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
  if (body.length > 500) throw new SenderError('Message is too long');
  const c = ctx.db.chat.id.find(chatId);
  if (!c) throw new SenderError('Unknown chat');
  const mine = c.a.isEqual(ctx.sender) || c.b.isEqual(ctx.sender);
  if (!mine) throw new SenderError('You are not in this chat');
  if (c.status === 'ended' || casualExpired(ctx, chatId)) throw new SenderError('This chat has ended');
  checkRate(ctx, chatId);

  postMessage(ctx, chatId, ctx.sender, body);
  noteMessage(ctx, c);
  startCasualClock(ctx, chatId); // both modes: live for 2 days from the first message
});

/**
 * AI service: apply one scored batch of a comp chat (messages [fromCount,
 * throughCount) in chat order). Caps and batch rules are enforced in points.ts.
 */
export const awardPoints = spacetimedb.reducer(
  { chatId: t.u64(), fromCount: t.u32(), throughCount: t.u32(), awards: t.array(AwardInput) },
  (ctx, { chatId, fromCount, throughCount, awards }) => {
    requireService(ctx);
    applyAwards(ctx, chatId, fromCount, throughCount, awards);
  }
);

/** AI service: record an ended comp chat's result (winner by points) and holistic feedback. */
export const setChatResult = spacetimedb.reducer(
  { chatId: t.u64(), summary: t.string(), feedbackA: t.string(), feedbackB: t.string() },
  (ctx, { chatId, summary, feedbackA, feedbackB }) => {
    requireService(ctx);
    finalizeResult(ctx, chatId, summary, feedbackA, feedbackB);
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
  recordEvent(ctx, ctx.sender, c.topicId, delta > 0 ? 'like' : 'unlike');
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

/* ---------------- feed recommendations ---------------- */

/** Client-observed actions: opening a topic or conversation, and reading one for 20 s+. */
export const trackEvent = spacetimedb.reducer({ topicId: t.u64(), kind: t.string() }, (ctx, { topicId, kind }) => {
  requireProfile(ctx);
  if (kind !== 'open' && kind !== 'read') throw new SenderError('Unknown event');
  recordEvent(ctx, ctx.sender, topicId, kind);
});

/** Topics that were actually on screen, batched by the client. Repeats within a day are ignored. */
export const trackImpressions = spacetimedb.reducer({ topicIds: t.array(t.u64()) }, (ctx, { topicIds }) => {
  requireProfile(ctx);
  if (topicIds.length > 50) throw new SenderError('Too many impressions at once');
  for (const id of new Set(topicIds)) if (ctx.db.topic.id.find(id)) recordEvent(ctx, ctx.sender, id, 'impression');
});

/** Spectator actions on one conversation: "open", or "read" (20 s+). Also counts toward its topic. */
export const trackConvoEvent = spacetimedb.reducer({ chatId: t.u64(), kind: t.string() }, (ctx, { chatId, kind }) => {
  requireProfile(ctx);
  if (kind !== 'open' && kind !== 'read') throw new SenderError('Unknown event');
  recordConvoEvent(ctx, ctx.sender, chatId, kind);
});

/** Conversation cards that were actually on screen, batched by the client. Repeats within a day are ignored. */
export const trackConvoImpressions = spacetimedb.reducer({ chatIds: t.array(t.u64()) }, (ctx, { chatIds }) => {
  requireProfile(ctx);
  if (chatIds.length > 50) throw new SenderError('Too many impressions at once');
  for (const id of new Set(chatIds)) if (ctx.db.chat.id.find(id)) recordConvoEvent(ctx, ctx.sender, id, 'impression');
});

/** Welcome-screen interests: tag slugs (or "cat:<slug>") to start the taste profile with. */
export const setInterests = spacetimedb.reducer({ interests: t.array(t.string()) }, (ctx, { interests }) => {
  requirePlayer(ctx);
  seedInterests(ctx, ctx.sender, interests);
});

/**
 * Replace a topic's tags, tone and entities. Only the trusted tagging service
 * (an identity the admin registered with grantService) may call this.
 */
export const setTopicFeatures = spacetimedb.reducer(
  { topicId: t.u64(), tags: t.array(t.string()), tone: t.string(), entities: t.array(EntityInput) },
  (ctx, { topicId, tags, tone, entities }) => {
    if (!ctx.db.service.identity.find(ctx.sender)) throw new SenderError('Only the tagging service may set topic features');
    if (!ctx.db.topic.id.find(topicId)) throw new SenderError('Unknown topic');
    const unknown = tags.filter(s => !TAG_SLUGS.has(s));
    if (unknown.length) throw new SenderError(`Unknown tags: ${unknown.join(', ')}`);
    if (tags.length < 1 || tags.length > 4) throw new SenderError('Give 1–4 tags');
    if (tone !== 'serious' && tone !== 'fun') throw new SenderError('Tone must be serious or fun');
    if (entities.length > 6) throw new SenderError('Give at most 6 entities');
    for (const e of entities) {
      if (!e.name.trim() || e.name.length > 60) throw new SenderError('Entity names must be 1–60 characters');
      if (!(e.weight >= 0 && e.weight <= 1)) throw new SenderError('Entity weights must be 0–1');
    }
    applyTopicFeatures(ctx, topicId, { tags, tone, entities, source: 'ai' });
  }
);

/** Admin: allow an identity (e.g. the AI tagging server) to call setTopicFeatures. */
export const grantService = spacetimedb.reducer({ identity: t.identity(), label: t.string() }, (ctx, { identity, label }) => {
  requireAdmin(ctx);
  if (ctx.db.service.identity.find(identity)) ctx.db.service.identity.update({ identity, label });
  else ctx.db.service.insert({ identity, label });
});

export const revokeService = spacetimedb.reducer({ identity: t.identity() }, (ctx, { identity }) => {
  requireAdmin(ctx);
  ctx.db.service.identity.delete(identity);
});

/** Admin: create the tag list and tag every untagged topic (run once after deploying this to an existing database). */
export const backfillTopicFeatures = spacetimedb.reducer(ctx => {
  requireAdmin(ctx);
  console.info(`Tagged ${backfillFeatures(ctx)} topics`);
});

export const pruneTick = spacetimedb.reducer({ onSchedule: pruneJob }, { job: pruneJob.rowType }, ctx => {
  pruneInteractions(ctx);
});

/** Every minute: end casual chats that are 2 days past their first message. */
export const casualSweepTick = spacetimedb.reducer({ onSchedule: casualSweepJob }, { job: casualSweepJob.rowType }, ctx => {
  sweepCasualChats(ctx);
});

/**
 * Write the AI summary of a finished conversation. Only the registered AI
 * service may call this, and only for ended chats (live chats have no summary).
 */
export const setChatSummary = spacetimedb.reducer({ chatId: t.u64(), summary: t.string() }, (ctx, { chatId, summary }) => {
  if (!ctx.db.service.identity.find(ctx.sender)) throw new SenderError('Only the AI service may write summaries');
  const c = ctx.db.chat.id.find(chatId);
  if (!c) throw new SenderError('Unknown conversation');
  if (c.status !== 'ended') throw new SenderError('Only ended conversations get a summary');
  const text = summary.trim();
  if (!text || text.length > 600) throw new SenderError('Summaries must be 1–600 characters');
  ctx.db.chat.id.update({ ...c, summary: text });
});
