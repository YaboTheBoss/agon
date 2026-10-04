/**
 * Feed recommendations: topic features, event logging and taste profiles.
 * Design: "yaapi feed recommendations" doc.
 *
 * - Every topic is described by features: its category, 2–4 tags from one
 *   app-wide list, a tone (serious / fun) and named entities (people, teams,
 *   works) with a weight for how central each is.
 * - Every action a player takes on a topic adds a weighted amount to their
 *   score for each of that topic's features (`affinity`), with a 14-day
 *   half-life so tastes can change.
 * - The ranking itself runs in the client (views can't read the clock), from
 *   public topic data plus the player's own private rows, which visibility
 *   filters in index.ts keep private.
 *
 * Only new tables live here, so publishing to an existing database migrates
 * without touching data. Reducers are thin wrappers in index.ts (the module
 * entry must export them); everything they call is here.
 */

import { table, t, SenderError } from 'spacetimedb/server';
import { Identity, Timestamp } from 'spacetimedb';
import type { Ctx } from './index';

/* ---------------- tables ---------------- */

/** The app-wide tag list. Topics may only carry tags from here. */
export const tag = table(
  { name: 'tag', public: true },
  {
    slug: t.string().primaryKey(),
    name: t.string(),
    sort: t.u32(),
  }
);

export const topicTag = table(
  { name: 'topic_tag', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    topicId: t.u64().index('btree'),
    tag: t.string(),
  }
);

/** One row per tagged topic: tone, and who tagged it ("seed" | "keywords" | "ai"). */
export const topicMeta = table(
  { name: 'topic_meta', public: true },
  {
    topicId: t.u64().primaryKey(),
    tone: t.string(),
    source: t.string(),
    taggedAt: t.timestamp(),
  }
);

/** Specific people, teams, works… under one canonical name each. */
export const entity = table(
  { name: 'entity', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    key: t.string().unique(), // normalised: lowercase, no punctuation
    name: t.string(),
  }
);

export const topicEntity = table(
  { name: 'topic_entity', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    topicId: t.u64().index('btree'),
    entityId: t.u64().index('btree'),
    weight: t.f32(), // 0–1, how central the entity is to the topic
  }
);

/** Raw event log. Private: never sent to any client. Pruned after 90 days. */
export const interaction = table(
  { name: 'interaction' },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    topicId: t.u64(),
    kind: t.string(),
    at: t.timestamp(),
  }
);

/**
 * A player's score per feature ("cat:food", "tag:money", "ent:12",
 * "tone:fun", "mode:comp"). Score is in event units and decays from
 * `updatedAt` with a 14-day half-life. Each player sees only their own rows.
 */
export const affinity = table(
  {
    name: 'affinity',
    public: true,
    indexes: [{ accessor: 'by_owner_feature', algorithm: 'btree', columns: ['owner', 'feature'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    feature: t.string(),
    score: t.f64(),
    updatedAt: t.timestamp(),
  }
);

/** Per player per topic: impressions, opens, engagement. Each player sees only their own rows. */
export const topicMemory = table(
  {
    name: 'topic_memory',
    public: true,
    indexes: [{ accessor: 'by_owner_topic', algorithm: 'btree', columns: ['owner', 'topicId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    topicId: t.u64(),
    shown: t.u32(),
    lastShownAt: t.timestamp(),
    lastOpenAt: t.timestamp(),
    engaged: t.bool(),
    hiddenUntil: t.timestamp(),
  }
);

/** Per player per conversation: seen / opened / read, for the View yaaps ranking. Each player sees only their own rows. */
export const convoMemory = table(
  {
    name: 'convo_memory',
    public: true,
    indexes: [{ accessor: 'by_owner_chat', algorithm: 'btree', columns: ['owner', 'chatId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    chatId: t.u64(),
    shown: t.u32(),
    lastShownAt: t.timestamp(),
    opened: t.bool(),
    read: t.bool(),
  }
);

/** Public per-conversation counters (unique readers) for like-rate popularity. */
export const chatStats = table(
  { name: 'chat_stats', public: true },
  {
    chatId: t.u64().primaryKey(),
    readers: t.u32(),
  }
);

/** Identities allowed to set topic features (the AI tagging server). Private; managed by the admin. */
export const service = table(
  { name: 'service' },
  {
    identity: t.identity().primaryKey(),
    label: t.string(),
  }
);

/** Daily job that prunes old interaction rows. */
export const pruneJob = table(
  { name: 'prune_job' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

/** Shape of one entity sent to setTopicFeatures. */
export const EntityInput = t.object('EntityInput', { name: t.string(), weight: t.f32() });

/* ---------------- constants ---------------- */

const MICROS_PER_DAY = 86_400_000_000n;
const HALF_LIFE_DAYS = 14;
const RETENTION_DAYS = 90n;
const IMPRESSION_COOLDOWN_MICROS = 20n * 3_600_000_000n; // one impression per topic per ~day
const OPEN_COOLDOWN_MICROS = 10n * 60_000_000n;
const HIDE_FOR_MICROS = 7n * MICROS_PER_DAY;
const DROP_BELOW = 0.05; // affinity rows this close to zero are deleted

/** Event weights (design doc: Signals). */
export const WEIGHTS = {
  create: 5,
  pick: 4,
  message: 1, // per message, first 4 messages of a chat only
  like: 3,
  unlike: -3,
  open: 1,
  read: 1,
  impression: -0.3,
  ignored: -1, // extra, once, when shown 3+ times and never touched
  interest: 2.5, // picked on the welcome screen
} as const;
export type EventKind = keyof typeof WEIGHTS;

/** [slug, display name, keywords that suggest it] — the app-wide list. */
const TAGS: [string, string, string[]][] = [
  ['food', 'Food', ['food', 'pizza', 'burger', 'sandwich', 'hot dog', 'taco', 'cereal', 'soup', 'pineapple', 'breakfast', 'dinner', 'snack', 'fries', 'ketchup', 'sushi', 'eat', 'eating']],
  ['drinks', 'Drinks', ['coffee', 'tea', 'soda', 'boba', 'drink', 'drinks', 'beer', 'wine']],
  ['cooking', 'Cooking', ['cook', 'cooking', 'recipe', 'bake', 'baking', 'chef', 'oven']],
  ['sports', 'Sports', ['sport', 'sports', 'athlete', 'athletes', 'team', 'league', 'ncaa', 'nba', 'nfl', 'mlb', 'baseball', 'basketball', 'football', 'soccer', 'tennis', 'olympics', 'dh']],
  ['fitness', 'Fitness', ['gym', 'workout', 'fitness', 'running', 'exercise', 'lifting']],
  ['health', 'Health', ['health', 'sleep', 'diet', 'mental health', 'doctor', 'vaccine']],
  ['music', 'Music', ['music', 'album', 'albums', 'song', 'songs', 'vinyl', 'streaming', 'concert', 'rapper', 'singer', 'band', 'playlist', 'rollout']],
  ['movies', 'Movies', ['movie', 'movies', 'film', 'films', 'cinema', 'remake', 'remakes', 'sequel', 'director', 'oscars']],
  ['tv', 'TV & shows', ['tv', 'show', 'shows', 'series', 'season', 'episode', 'netflix', 'binge']],
  ['books', 'Books', ['book', 'books', 'novel', 'reading', 'author']],
  ['gaming', 'Gaming', ['game', 'games', 'gaming', 'gamer', 'open-world', 'console', 'nintendo', 'playstation', 'xbox', 'esports']],
  ['anime', 'Anime', ['anime', 'manga']],
  ['art', 'Art & design', ['art', 'artist', 'design', 'painting', 'museum']],
  ['fashion', 'Fashion', ['fashion', 'outfit', 'clothes', 'sneakers', 'style', 'dress code']],
  ['celebrities', 'Celebrities', ['celebrity', 'celebrities', 'famous', 'influencer', 'influencers']],
  ['social-media', 'Social media', ['social media', 'tiktok', 'instagram', 'twitter', 'youtube', 'followers', 'posting']],
  ['internet', 'Internet culture', ['meme', 'memes', 'internet', 'online', 'viral', 'reddit']],
  ['tech', 'Tech', ['tech', 'technology', 'app', 'apps', 'phone', 'iphone', 'android', 'software', 'computer', 'verify']],
  ['ai', 'AI', ['ai', 'artificial intelligence', 'chatgpt', 'claude', 'gemini', 'robot', 'robots', 'automation']],
  ['science', 'Science', ['science', 'scientist', 'research', 'study', 'physics', 'biology']],
  ['space', 'Space', ['space', 'mars', 'moon', 'nasa', 'aliens', 'planet']],
  ['environment', 'Environment', ['climate', 'environment', 'carbon', 'recycling', 'pollution', 'green energy']],
  ['animals', 'Animals', ['animal', 'animals', 'dog', 'dogs', 'cat', 'cats', 'pet', 'pets', 'zoo']],
  ['travel', 'Travel', ['travel', 'vacation', 'trip', 'flight', 'flights', 'airport', 'tourist']],
  ['cars', 'Cars', ['car', 'cars', 'driving', 'electric vehicle', 'tesla', 'traffic']],
  ['money', 'Money', ['money', 'paid', 'pay', 'salary', 'wage', 'wages', 'rich', 'tax', 'taxes', 'price', 'prices', 'tipping', 'tip', 'cost', 'afford']],
  ['work', 'Work & careers', ['work', 'job', 'jobs', 'career', 'careers', 'employee', 'employees', 'boss', 'remote work', 'office', 'internship']],
  ['college', 'College', ['college', 'university', 'universities', 'campus', 'student', 'students', 'professor', 'major', 'dorm']],
  ['school', 'School', ['school', 'homework', 'teacher', 'teachers', 'exam', 'exams', 'grades', 'graded', 'coursework', 'class', 'group projects']],
  ['dating', 'Dating', ['dating', 'date', 'crush', 'first date', 'dating apps', 'situationship']],
  ['relationships', 'Relationships', ['relationship', 'relationships', 'partner', 'marriage', 'breakup', 'ex']],
  ['friendship', 'Friendship', ['friend', 'friends', 'friendship', 'roommate', 'roommates', 'group chat']],
  ['family', 'Family', ['family', 'parents', 'siblings', 'kids', 'children', 'mom', 'dad']],
  ['politics', 'Politics', ['politics', 'political', 'government', 'election', 'vote', 'voting', 'law', 'laws', 'policy', 'ban']],
  ['ethics', 'Ethics', ['ethics', 'ethical', 'moral', 'morally', 'fair', 'unfair', 'should', 'right', 'wrong']],
  ['religion', 'Religion & belief', ['religion', 'god', 'faith', 'church', 'spiritual']],
  ['philosophy', 'Philosophy', ['philosophy', 'meaning of life', 'free will', 'consciousness', 'simulation']],
  ['history', 'History', ['history', 'historical', 'ancient', 'century', 'war']],
  ['language', 'Language', ['language', 'word', 'words', 'grammar', 'slang', 'definition', 'pronounce']],
  ['cities', 'Cities & places', ['city', 'cities', 'town', 'new york', 'la', 'suburbs', 'country']],
  ['housing', 'Housing', ['housing', 'rent', 'apartment', 'house', 'landlord']],
  ['holidays', 'Holidays', ['holiday', 'holidays', 'christmas', 'halloween', 'thanksgiving', 'birthday']],
  ['etiquette', 'Etiquette', ['etiquette', 'rude', 'polite', 'manners', 'texting', 'reply', 'late']],
  ['hypotheticals', 'Hypotheticals', ['would you rather', 'if you could', 'superpower', 'zombie', 'time travel', 'hypothetically']],
  ['everyday-life', 'Everyday life', ['shower', 'morning', 'night', 'weekend', 'chores', 'laundry', 'commute']],
];
export const TAG_SLUGS = new Set(TAGS.map(([slug]) => slug));

/** A category's own tag, used when keywords find nothing. */
const CATEGORY_TAG: Record<string, string> = {
  food: 'food',
  sports: 'sports',
  music: 'music',
  movies: 'movies',
  tech: 'tech',
  campus: 'college',
  games: 'gaming',
};

const FUN_WORDS = ['hot dog', 'sandwich', 'pineapple', 'pizza', 'cereal', 'soup', 'superpower', 'zombie', 'would you rather', 'cats', 'dogs', 'meme', 'memes'];

/** Hand-written features for the seeded demo topics (by title). */
const SEED_FEATURES: Record<string, { tags: string[]; tone: string; entities: [string, number][] }> = {
  'Is a hot dog a sandwich?': { tags: ['food', 'language'], tone: 'fun', entities: [] },
  'Should universities allow AI tools on graded coursework?': { tags: ['ai', 'college', 'school', 'ethics'], tone: 'serious', entities: [] },
  'Are movie remakes ruining cinema?': { tags: ['movies'], tone: 'serious', entities: [['Hollywood', 0.5]] },
  'Should college athletes be paid like employees?': { tags: ['sports', 'college', 'money', 'work'], tone: 'serious', entities: [['NCAA', 0.6]] },
  'Does vinyl actually sound better than streaming?': { tags: ['music', 'tech'], tone: 'fun', entities: [['Spotify', 0.3]] },
  "Should social media verify every user's age?": { tags: ['social-media', 'tech', 'politics'], tone: 'serious', entities: [] },
  'Pineapple belongs on pizza.': { tags: ['food'], tone: 'fun', entities: [] },
  'The book is always better than the movie.': { tags: ['books', 'movies'], tone: 'fun', entities: [] },
  'Group projects should be optional.': { tags: ['school', 'college'], tone: 'fun', entities: [] },
  'Are open-world games too big now?': { tags: ['gaming'], tone: 'fun', entities: [] },
  'Was the universal DH good for baseball?': { tags: ['sports'], tone: 'serious', entities: [['MLB', 0.8]] },
  'Surprise album drops beat long rollouts.': { tags: ['music'], tone: 'fun', entities: [] },
};

/* ---------------- helpers ---------------- */

const at = (ts: Timestamp) => ts.microsSinceUnixEpoch;

/** Scale a stored score from `updatedAt` to `now` (14-day half-life). */
export function decayed(score: number, updatedAt: Timestamp, now: Timestamp) {
  const days = Number(at(now) - at(updatedAt)) / Number(MICROS_PER_DAY);
  return days <= 0 ? score : score * Math.pow(2, -days / HALF_LIFE_DAYS);
}

/** "  The Lakers! " → "lakers": the key that makes "Ari", "ariana grande" duplicates findable. */
export function entityKey(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/^the\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const hasWord = (text: string, word: string) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text);

/** Baseline tagger (and fallback for the AI one): keyword matches, best 4. */
export function keywordFeatures(title: string, sideA: string, sideB: string, category: string) {
  const text = `${title} ${sideA} ${sideB}`.toLowerCase();
  const hits = TAGS.map(([slug, , words]) => ({ slug, n: words.filter(w => hasWord(text, w)).length }))
    .filter(h => h.n > 0 && h.slug !== 'ethics') // "should" is everywhere; ethics only via seed/AI
    .sort((x, y) => y.n - x.n)
    .slice(0, 4)
    .map(h => h.slug);
  const own = CATEGORY_TAG[category];
  if (own && !hits.includes(own)) hits.unshift(own);
  const tags = hits.slice(0, 4);
  const tone = FUN_WORDS.some(w => hasWord(text, w)) ? 'fun' : 'serious';
  return { tags, tone };
}

/** Insert any missing tags from the app-wide list. Safe to call repeatedly. */
export function ensureTags(ctx: Ctx) {
  TAGS.forEach(([slug, name], i) => {
    if (!ctx.db.tag.slug.find(slug)) ctx.db.tag.insert({ slug, name, sort: i });
  });
}

/** Replace a topic's tags, tone and entities. */
export function applyTopicFeatures(
  ctx: Ctx,
  topicId: bigint,
  f: { tags: string[]; tone: string; entities: { name: string; weight: number }[]; source: string }
) {
  for (const row of [...ctx.db.topicTag.topicId.filter(topicId)]) ctx.db.topicTag.id.delete(row.id);
  for (const row of [...ctx.db.topicEntity.topicId.filter(topicId)]) ctx.db.topicEntity.id.delete(row.id);

  for (const slug of [...new Set(f.tags)].filter(s => TAG_SLUGS.has(s)).slice(0, 4)) {
    ctx.db.topicTag.insert({ id: 0n, topicId, tag: slug });
  }
  for (const e of f.entities.slice(0, 6)) {
    const key = entityKey(e.name);
    if (!key) continue;
    const existing = ctx.db.entity.key.find(key);
    const ent = existing ?? ctx.db.entity.insert({ id: 0n, key, name: e.name.trim().slice(0, 60) });
    ctx.db.topicEntity.insert({ id: 0n, topicId, entityId: ent.id, weight: Math.min(1, Math.max(0, e.weight)) });
  }

  const meta = { topicId, tone: f.tone === 'fun' ? 'fun' : 'serious', source: f.source, taggedAt: ctx.timestamp };
  if (ctx.db.topicMeta.topicId.find(topicId)) ctx.db.topicMeta.topicId.update(meta);
  else ctx.db.topicMeta.insert(meta);
}

/** Tag a topic with the best features available without AI: seed data, else keywords. */
export function tagTopic(ctx: Ctx, topicId: bigint) {
  const tp = ctx.db.topic.id.find(topicId);
  if (!tp) return;
  const seeded = SEED_FEATURES[tp.title];
  if (seeded) {
    applyTopicFeatures(ctx, topicId, {
      tags: seeded.tags,
      tone: seeded.tone,
      entities: seeded.entities.map(([name, weight]) => ({ name, weight })),
      source: 'seed',
    });
    return;
  }
  const k = keywordFeatures(tp.title, tp.sideA, tp.sideB, tp.category);
  applyTopicFeatures(ctx, topicId, { ...k, entities: [], source: 'keywords' });
}

/** Tag list + features for every topic that has none yet. Idempotent. */
export function backfillFeatures(ctx: Ctx) {
  ensureTags(ctx);
  let tagged = 0;
  for (const tp of [...ctx.db.topic.iter()]) {
    if (ctx.db.topicMeta.topicId.find(tp.id)) continue;
    tagTopic(ctx, tp.id);
    tagged++;
  }
  return tagged;
}

/** The feature keys a topic carries, with how strongly each counts. */
function featuresOf(ctx: Ctx, topicId: bigint, mode?: string): { key: string; weight: number }[] {
  const tp = ctx.db.topic.id.find(topicId);
  if (!tp) return [];
  const out = [{ key: `cat:${tp.category}`, weight: 1 }];
  for (const row of ctx.db.topicTag.topicId.filter(topicId)) out.push({ key: `tag:${row.tag}`, weight: 1 });
  const meta = ctx.db.topicMeta.topicId.find(topicId);
  if (meta) out.push({ key: `tone:${meta.tone}`, weight: 1 });
  for (const row of ctx.db.topicEntity.topicId.filter(topicId)) out.push({ key: `ent:${row.entityId}`, weight: row.weight });
  if (mode === 'casual' || mode === 'comp') out.push({ key: `mode:${mode}`, weight: 1 });
  return out;
}

/** Decay a feature score to now and add `delta`. Rows that end up near zero are removed. */
export function bump(ctx: Ctx, owner: Identity, feature: string, delta: number) {
  const row = [...ctx.db.affinity.by_owner_feature.filter([owner, feature])][0];
  const score = (row ? decayed(row.score, row.updatedAt, ctx.timestamp) : 0) + delta;
  if (Math.abs(score) < DROP_BELOW) {
    if (row) ctx.db.affinity.id.delete(row.id);
    return;
  }
  if (row) ctx.db.affinity.id.update({ ...row, score, updatedAt: ctx.timestamp });
  else ctx.db.affinity.insert({ id: 0n, owner, feature, score, updatedAt: ctx.timestamp });
}

function memoryFor(ctx: Ctx, owner: Identity, topicId: bigint) {
  const row = [...ctx.db.topicMemory.by_owner_topic.filter([owner, topicId])][0];
  if (row) return row;
  return ctx.db.topicMemory.insert({
    id: 0n,
    owner,
    topicId,
    shown: 0,
    lastShownAt: Timestamp.UNIX_EPOCH,
    lastOpenAt: Timestamp.UNIX_EPOCH,
    engaged: false,
    hiddenUntil: Timestamp.UNIX_EPOCH,
  });
}

/**
 * Record one action and update the taste profile. Returns false when the event
 * was dropped by a cooldown (repeat impressions/opens), so nothing changed.
 */
export function recordEvent(ctx: Ctx, owner: Identity, topicId: bigint, kind: EventKind, opts: { mode?: string } = {}) {
  if (!ctx.db.topic.id.find(topicId)) throw new SenderError('Unknown topic');
  const now = at(ctx.timestamp);
  let mem = memoryFor(ctx, owner, topicId);
  let extra = 0;

  if (kind === 'impression') {
    if (now - at(mem.lastShownAt) < IMPRESSION_COOLDOWN_MICROS) return false;
    const shown = mem.shown + 1;
    let hiddenUntil = mem.hiddenUntil;
    if (shown === 3 && !mem.engaged) {
      extra = WEIGHTS.ignored;
      hiddenUntil = new Timestamp(at(ctx.timestamp) + HIDE_FOR_MICROS);
    }
    mem = { ...mem, shown, lastShownAt: ctx.timestamp, hiddenUntil };
  } else if (kind === 'open' || kind === 'read') {
    if (kind === 'open' && now - at(mem.lastOpenAt) < OPEN_COOLDOWN_MICROS) return false;
    mem = { ...mem, lastOpenAt: kind === 'open' ? ctx.timestamp : mem.lastOpenAt, engaged: true };
  } else if (WEIGHTS[kind] > 0) {
    mem = { ...mem, engaged: true };
  }
  ctx.db.topicMemory.id.update(mem);

  ctx.db.interaction.insert({ id: 0n, owner, topicId, kind, at: ctx.timestamp });
  const w = WEIGHTS[kind] + extra;
  for (const f of featuresOf(ctx, topicId, opts.mode)) bump(ctx, owner, f.key, w * f.weight);
  return true;
}

/** Welcome-screen interests: a head start on a few tags. */
export function seedInterests(ctx: Ctx, owner: Identity, tags: string[]) {
  if (tags.length > 12) throw new SenderError('Pick up to 12 interests');
  const picked = [...new Set(tags)].filter(s => TAG_SLUGS.has(s) || s.startsWith('cat:'));
  for (const s of picked) bump(ctx, owner, s.startsWith('cat:') ? s : `tag:${s}`, WEIGHTS.interest);
}

/** Delete interaction rows older than the retention window. The affinity table keeps the summary. */
export function pruneInteractions(ctx: Ctx) {
  const cutoff = at(ctx.timestamp) - RETENTION_DAYS * MICROS_PER_DAY;
  for (const row of [...ctx.db.interaction.iter()]) if (at(row.at) < cutoff) ctx.db.interaction.id.delete(row.id);
}

export const PRUNE_EVERY_MICROS = MICROS_PER_DAY;

/* ---------------- conversations (View yaaps) ---------------- */

export type ConvoEventKind = 'open' | 'read' | 'impression';

function convoMemoryFor(ctx: Ctx, owner: Identity, chatId: bigint) {
  const row = [...ctx.db.convoMemory.by_owner_chat.filter([owner, chatId])][0];
  if (row) return row;
  return ctx.db.convoMemory.insert({ id: 0n, owner, chatId, shown: 0, lastShownAt: Timestamp.UNIX_EPOCH, opened: false, read: false });
}

/**
 * Record a spectator action on one conversation. Opens and reads also count
 * toward the conversation's topic (recordEvent, with its own cooldowns).
 * Readers are counted once per player. Returns false if nothing changed.
 */
export function recordConvoEvent(ctx: Ctx, owner: Identity, chatId: bigint, kind: ConvoEventKind) {
  const chat = ctx.db.chat.id.find(chatId);
  if (!chat) throw new SenderError('Unknown conversation');
  const mem = convoMemoryFor(ctx, owner, chatId);

  if (kind === 'impression') {
    if (at(ctx.timestamp) - at(mem.lastShownAt) < IMPRESSION_COOLDOWN_MICROS) return false;
    ctx.db.convoMemory.id.update({ ...mem, shown: mem.shown + 1, lastShownAt: ctx.timestamp });
    return true;
  }

  if (kind === 'open') {
    if (!mem.opened) ctx.db.convoMemory.id.update({ ...mem, opened: true });
    recordEvent(ctx, owner, chat.topicId, 'open');
    return true;
  }

  // read
  if (mem.read) return false;
  ctx.db.convoMemory.id.update({ ...mem, opened: true, read: true });
  const stats = ctx.db.chatStats.chatId.find(chatId);
  if (stats) ctx.db.chatStats.chatId.update({ ...stats, readers: stats.readers + 1 });
  else ctx.db.chatStats.insert({ chatId, readers: 1 });
  recordEvent(ctx, owner, chat.topicId, 'read');
  return true;
}
