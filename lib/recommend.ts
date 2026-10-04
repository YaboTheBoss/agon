/**
 * Feed ranking (design doc: "yaapi feed recommendations" → Ranking).
 *
 * Runs in the browser: SpacetimeDB views can't read the clock, and every input
 * is either public topic data or the player's own private rows (affinity,
 * topic memory), which visibility filters keep from anyone else.
 *
 *   score = 0.40·A + 0.25·P + 0.15·F + 0.10·S + 0.10·M − penalty
 *
 * then: your own fresh topics first, 1 exploration slot in 10, and at most 2
 * cards of one category in a row.
 *
 * Conversations ("View yaaps", rankConvos) reuse the same profile through
 * their topic, with like-based popularity:
 *
 *   score = 0.35·A + 0.25·P + 0.15·F + 0.10·L + 0.15·Q − penalty
 */

import type { Convo, Topic } from "@/lib/data";

export type FeedEntity = { id: string; name: string; weight: number };
export type MemoryRow = { shown: number; engaged: boolean; hiddenUntil: number };

export type FeedInputs = {
  topics: Topic[];
  tagsByTopic: Map<string, string[]>;
  toneByTopic: Map<string, string>;
  entitiesByTopic: Map<string, FeedEntity[]>;
  /** feature key ("cat:food", "tag:money", "ent:12", "tone:fun") → raw score, already decayed to now */
  affinity: Map<string, number>;
  memory: Map<string, MemoryRow>;
  chatsByTopic: Map<string, { total: number; live24h: number }>;
  /** other players waiting in the queue, per topic */
  waitingByTopic: Map<string, number>;
  tagNames: Map<string, string>;
  categoryNames: Map<string, string>;
  now: number;
  /** stable per player (identity hex), so exploration picks don't flicker */
  seed: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const HALF_LIFE_DAYS = 14;
const EXPLORE_EVERY = 10;
const MAX_SAME_CATEGORY_RUN = 2;

/** A stored score decayed from `updatedAt` to `now` (same 14-day half-life as the server). */
export function decayScore(score: number, updatedAt: number, now: number) {
  const days = (now - updatedAt) / DAY;
  return days <= 0 ? score : score * Math.pow(2, -days / HALF_LIFE_DAYS);
}

/** Raw event-unit score → −1…+1. One pick (4) ≈ 0.66; a welcome interest (2.5) ≈ 0.46. */
const squash = (raw: number | undefined) => (raw ? Math.tanh(raw / 5) : 0);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Tiny deterministic hash → 0…1, for stable exploration order. */
function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** What both feeds rank: a card with a category and the parts of its score. */
type Ranked = { key: string; category: string; score: number; affinity: number; popularity: number; freshness: number; reason?: string };
type Scored = Ranked & { topic: Topic; hidden: boolean };

/**
 * A — how much this player likes a topic, −1…+1. Card features: sum / √n,
 * clamped, so liked features count without unknown ones (score 0) watering them
 * down, and many tags earn no runaway bonus. Entities: weight × score, summed and
 * clamped. Entities weigh more when present.
 */
export function topicAffinity(t: Topic, inp: FeedInputs): number {
  const keys = [`cat:${t.category}`, ...(inp.tagsByTopic.get(t.id) ?? []).map((g) => `tag:${g}`)];
  const tone = inp.toneByTopic.get(t.id);
  if (tone) keys.push(`tone:${tone}`);
  const tagMatch = clamp(keys.reduce((sum, k) => sum + squash(inp.affinity.get(k)), 0) / Math.sqrt(keys.length), -1, 1);
  const ents = inp.entitiesByTopic.get(t.id) ?? [];
  const entityMatch = clamp(ents.reduce((sum, e) => sum + e.weight * squash(inp.affinity.get(`ent:${e.id}`)), 0), -1, 1);
  return ents.length ? 0.4 * tagMatch + 0.6 * entityMatch : tagMatch;
}

/** "Because you like …": the strongest liked entity, else the strongest liked tag or category. */
export function likedReason(t: Topic, inp: FeedInputs): string | undefined {
  let best: { label: string; v: number } | undefined;
  for (const e of inp.entitiesByTopic.get(t.id) ?? []) {
    const v = e.weight * squash(inp.affinity.get(`ent:${e.id}`));
    if (v > 0.3 && (!best || v > best.v)) best = { label: e.name, v };
  }
  if (best) return `Because you like ${best.label}`;
  const keys = [`cat:${t.category}`, ...(inp.tagsByTopic.get(t.id) ?? []).map((g) => `tag:${g}`)];
  for (const k of keys) {
    const v = squash(inp.affinity.get(k));
    if (v > 0.3 && (!best || v > best.v)) {
      best = { label: k.startsWith("cat:") ? inp.categoryNames.get(k.slice(4)) ?? k.slice(4) : inp.tagNames.get(k.slice(4)) ?? k.slice(4), v };
    }
  }
  return best ? `Because you like ${best.label}` : undefined;
}

export function scoreTopics(inp: FeedInputs): Scored[] {
  const pop = inp.topics.map((t) => {
    const ageDays = Math.max(0, inp.now - t.createdAt) / DAY;
    const chats = inp.chatsByTopic.get(t.id)?.total ?? 0;
    return Math.log10(1 + t.players + 5 * chats) / (1 + ageDays / 30);
  });
  const maxPop = Math.max(1e-9, ...pop);

  return inp.topics.map((t, i) => {
    const A = topicAffinity(t, inp);
    // P — popularity, F — freshness, S — social proof, M — match odds.
    const P = pop[i] / maxPop;
    const F = Math.exp(-Math.max(0, inp.now - t.createdAt) / (72 * HOUR));
    const S = 1 - 1 / (1 + (inp.chatsByTopic.get(t.id)?.live24h ?? 0));
    const M = 1 - 1 / (1 + (inp.waitingByTopic.get(t.id) ?? 0));

    // Penalty — seen but never touched; hidden for a week after 3 ignored showings.
    const mem = inp.memory.get(t.id);
    const hidden = !!mem && !mem.engaged && mem.hiddenUntil > inp.now;
    const penalty = mem && !mem.engaged ? 0.05 * Math.min(mem.shown, 3) : 0;

    const score = 0.4 * A + 0.25 * P + 0.15 * F + 0.1 * S + 0.1 * M - penalty;
    const reason = likedReason(t, inp) ?? (F > 0.7 ? "New debate" : undefined);
    return { key: t.id, category: t.category, topic: t, score, affinity: A, popularity: P, freshness: F, reason, hidden };
  });
}

/** Re-order so no more than MAX_SAME_CATEGORY_RUN cards of one category sit in a row. */
function diversify<T extends Ranked>(list: T[]): T[] {
  const left = [...list];
  const out: T[] = [];
  while (left.length) {
    const run = out.slice(-MAX_SAME_CATEGORY_RUN).map((s) => s.category);
    const blocked = run.length === MAX_SAME_CATEGORY_RUN && run.every((c) => c === run[0]) ? run[0] : null;
    const i = Math.max(0, left.findIndex((s) => s.category !== blocked));
    out.push(...left.splice(i, 1));
  }
  return out;
}

/**
 * Sorted-by-score cards → final order. Once the player has a profile, every 10th
 * slot goes to a card outside their tastes: brand-new ones first (they have no
 * popularity yet, so this is how they get seen), then popular ones; each group in
 * a stable per-player-per-day order, and only as many as there are slots. The
 * rest is diversified by category.
 */
function withExploration<T extends Ranked>(visible: T[], inp: { seed: string; now: number; hasProfile: boolean }): T[] {
  const day = Math.floor(inp.now / DAY);
  const stable = (s: T) => hash01(`${inp.seed}:${day}:${s.key}`);
  const unfamiliar = visible.filter((s) => Math.abs(s.affinity) < 0.1);
  const explore = inp.hasProfile
    ? [
        ...unfamiliar.filter((s) => s.freshness >= 0.5).sort((x, y) => stable(x) - stable(y)),
        ...unfamiliar.filter((s) => s.freshness < 0.5 && s.popularity >= 0.3).sort((x, y) => stable(x) - stable(y)),
      ].slice(0, Math.floor(visible.length / EXPLORE_EVERY))
    : [];
  const main = diversify(visible.filter((s) => !explore.includes(s)));
  const ordered: T[] = [];
  while (main.length || explore.length) {
    const exploreSlot = (ordered.length + 1) % EXPLORE_EVERY === 0 && explore.length > 0;
    if (exploreSlot || !main.length) ordered.push({ ...explore.shift()!, reason: "Something new to try" });
    else ordered.push(main.shift()!);
  }
  return ordered;
}

export function rankFeed(inp: FeedInputs): Topic[] {
  const scored = scoreTopics(inp);
  const byScore = (x: Scored, y: Scored) => y.score - x.score;

  // Your own topics from the last day stay on top (you just posted them).
  const pinned = scored.filter((s) => s.topic.mine && inp.now - s.topic.createdAt < DAY).sort((x, y) => y.topic.createdAt - x.topic.createdAt);
  const rest = scored.filter((s) => !pinned.includes(s));
  const visible = rest.filter((s) => !s.hidden).sort(byScore);
  const hidden = rest.filter((s) => s.hidden).sort(byScore);
  const ordered = withExploration(visible, { seed: inp.seed, now: inp.now, hasProfile: inp.affinity.size > 0 });

  return [...pinned.map((s) => ({ ...s, reason: "You created this" })), ...ordered, ...hidden].map((s) => ({ ...s.topic, reason: s.reason }));
}

/* ---------------- View yaaps: conversations ---------------- */

export type ConvoMemoryRow = { shown: number; opened: boolean; read: boolean };

export type ConvoInputs = {
  convos: Convo[];
  /** The topic feed's inputs: conversations are judged through their topic. */
  topicInputs: FeedInputs;
  memory: Map<string, ConvoMemoryRow>;
  /** unique readers (20 s+) per conversation */
  readers: Map<string, number>;
};

type ScoredConvo = Ranked & { convo: Convo };

/**
 * Rank conversations for spectating (casual and comp together). Left out: your
 * own, empty ones, and live casual chats whose last message is over a minute
 * old (only chats happening right now, or finished ones, are worth watching).
 *   A — the topic's affinity · P — likes, readers and like rate, aged by last message
 *   F — recency · L — live now · Q — length, plus a finished comp result.
 */
export function rankConvos(inp: ConvoInputs): Convo[] {
  const { now } = inp.topicInputs;
  const topicById = new Map(inp.topicInputs.topics.map((t) => [t.id, t]));
  const candidates = inp.convos.filter(
    (c) => !c.mine && c.messages.length > 0 && !(c.mode === "casual" && c.status !== "ended" && now - c.lastAt > MINUTE)
  );

  const pop = candidates.map((c) => {
    const readers = inp.readers.get(c.id) ?? 0;
    const likeRate = c.likes > 0 ? c.likes / Math.max(c.likes, readers) : 0;
    const days = Math.max(0, now - c.lastAt) / DAY;
    return (Math.log10(1 + 3 * c.likes + readers) * (1 + likeRate)) / (1 + days / 14);
  });
  const maxPop = Math.max(1e-9, ...pop);

  const scored: ScoredConvo[] = candidates.map((c, i) => {
    const topic = topicById.get(c.topicId);
    const A = topic ? topicAffinity(topic, inp.topicInputs) : 0;
    const P = pop[i] / maxPop;
    const sinceLast = Math.max(0, now - c.lastAt);
    const F = Math.exp(-sinceLast / (48 * HOUR));
    const L = sinceLast < HOUR ? 1 : 0;
    const Q = Math.min(1, Math.min(c.messages.length, 10) / 10 + (c.hasResult ? 0.2 : 0));
    const mem = inp.memory.get(c.id);
    const penalty = mem?.read ? 0.3 : mem?.opened ? 0.15 : mem && mem.shown >= 3 ? 0.1 : 0;

    const score = 0.35 * A + 0.25 * P + 0.15 * F + 0.1 * L + 0.15 * Q - penalty;
    const reason = (topic && likedReason(topic, inp.topicInputs)) ?? (L ? "Live now" : P > 0.7 ? "Popular right now" : undefined);
    return { key: c.id, category: topic?.category ?? "", convo: c, score, affinity: A, popularity: P, freshness: F, reason };
  });

  const ordered = withExploration(
    scored.sort((x, y) => y.score - x.score),
    { seed: inp.topicInputs.seed, now, hasProfile: inp.topicInputs.affinity.size > 0 }
  );
  return ordered.map((s) => ({ ...s.convo, reason: s.reason }));
}
