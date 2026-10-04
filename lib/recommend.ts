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
 */

import type { Topic } from "@/lib/data";

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

const HOUR = 3_600_000;
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

type Scored = { topic: Topic; score: number; affinity: number; popularity: number; freshness: number; reason?: string; hidden: boolean };

function explain(t: Topic, inp: FeedInputs, freshness: number): string | undefined {
  // Strongest liked entity, then strongest liked tag/category.
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
  if (best) return `Because you like ${best.label}`;
  if (freshness > 0.7) return "New debate";
  return undefined;
}

export function scoreTopics(inp: FeedInputs): Scored[] {
  const pop = inp.topics.map((t) => {
    const ageDays = Math.max(0, inp.now - t.createdAt) / DAY;
    const chats = inp.chatsByTopic.get(t.id)?.total ?? 0;
    return Math.log10(1 + t.players + 5 * chats) / (1 + ageDays / 30);
  });
  const maxPop = Math.max(1e-9, ...pop);

  return inp.topics.map((t, i) => {
    // A — affinity. Card features: sum / √n, clamped, so liked features count without
    // unknown ones (score 0) watering them down, and many tags earn no runaway bonus.
    // Entities: weight × score, summed and clamped.
    const keys = [`cat:${t.category}`, ...(inp.tagsByTopic.get(t.id) ?? []).map((g) => `tag:${g}`)];
    const tone = inp.toneByTopic.get(t.id);
    if (tone) keys.push(`tone:${tone}`);
    const tagMatch = clamp(keys.reduce((sum, k) => sum + squash(inp.affinity.get(k)), 0) / Math.sqrt(keys.length), -1, 1);
    const ents = inp.entitiesByTopic.get(t.id) ?? [];
    const entityMatch = clamp(ents.reduce((sum, e) => sum + e.weight * squash(inp.affinity.get(`ent:${e.id}`)), 0), -1, 1);
    const A = ents.length ? 0.4 * tagMatch + 0.6 * entityMatch : tagMatch;

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
    return { topic: t, score, affinity: A, popularity: P, freshness: F, reason: explain(t, inp, F), hidden };
  });
}

/** Re-order so no more than MAX_SAME_CATEGORY_RUN cards of one category sit in a row. */
function diversify(list: Scored[]): Scored[] {
  const left = [...list];
  const out: Scored[] = [];
  while (left.length) {
    const run = out.slice(-MAX_SAME_CATEGORY_RUN).map((s) => s.topic.category);
    const blocked = run.length === MAX_SAME_CATEGORY_RUN && run.every((c) => c === run[0]) ? run[0] : null;
    const i = Math.max(0, left.findIndex((s) => s.topic.category !== blocked));
    out.push(...left.splice(i, 1));
  }
  return out;
}

export function rankFeed(inp: FeedInputs): Topic[] {
  const scored = scoreTopics(inp);
  const byScore = (x: Scored, y: Scored) => y.score - x.score;

  // Your own topics from the last day stay on top (you just posted them).
  const pinned = scored.filter((s) => s.topic.mine && inp.now - s.topic.createdAt < DAY).sort((x, y) => y.topic.createdAt - x.topic.createdAt);
  const rest = scored.filter((s) => !pinned.includes(s));
  const visible = rest.filter((s) => !s.hidden).sort(byScore);
  const hidden = rest.filter((s) => s.hidden).sort(byScore);

  // Exploration: once the player has a profile, every 10th slot goes to a topic
  // outside their tastes. Brand-new topics come first (they have no popularity
  // yet, so this is how they get seen), then popular ones; each group in a stable
  // per-player-per-day order. Only as many as there are slots: the rest of the
  // unfamiliar topics rank normally.
  const hasProfile = inp.affinity.size > 0;
  const day = Math.floor(inp.now / DAY);
  const stable = (s: Scored) => hash01(`${inp.seed}:${day}:${s.topic.id}`);
  const unfamiliar = visible.filter((s) => Math.abs(s.affinity) < 0.1);
  const explore = hasProfile
    ? [
        ...unfamiliar.filter((s) => s.freshness >= 0.5).sort((x, y) => stable(x) - stable(y)),
        ...unfamiliar.filter((s) => s.freshness < 0.5 && s.popularity >= 0.3).sort((x, y) => stable(x) - stable(y)),
      ].slice(0, Math.floor(visible.length / EXPLORE_EVERY))
    : [];
  const main = diversify(visible.filter((s) => !explore.includes(s)));
  const ordered: Scored[] = [];
  while (main.length || explore.length) {
    const exploreSlot = (ordered.length + 1) % EXPLORE_EVERY === 0 && explore.length > 0;
    if (exploreSlot || !main.length) {
      const e = explore.shift()!;
      ordered.push({ ...e, reason: "Something new to try" });
    } else {
      ordered.push(main.shift()!);
    }
  }

  return [...pinned.map((s) => ({ ...s, reason: "You created this" })), ...ordered, ...hidden].map((s) => ({ ...s.topic, reason: s.reason }));
}
