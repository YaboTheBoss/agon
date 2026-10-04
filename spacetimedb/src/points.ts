/**
 * Comp scoring: points for constructive messages, awarded in batches.
 *
 * Comp chats run like casual ones (2 days from the first message, chat freely).
 * Every 6 new messages the AI service scores that batch and calls award_points;
 * only constructive messages earn points, each with a short reason. When the
 * chat ends, leftover messages get a final pass, the side with more points wins
 * (decided here, not by the AI), and set_chat_result stores the AI's holistic
 * feedback. A player can also yield (concede): the debate ends at once and the
 * other player wins, whatever the points.
 *
 * The AI's judgement is one layer; the hard limits are enforced here, so even a
 * fooled model can't hand out unbounded points:
 *   - at most MAX_PER_MESSAGE per message and MAX_PER_SIDE_PER_BATCH per side per batch
 *   - awards only for messages in the batch being scored
 *   - each batch applied once (fromCount must match what's already scored)
 *
 * Only new tables live here, so publishing to an existing database migrates
 * without touching data.
 */

import { table, t, SenderError } from 'spacetimedb/server';
import type { Ctx } from './index';

export const BATCH_SIZE = 6;
export const MAX_PER_MESSAGE = 5;
export const MAX_PER_SIDE_PER_BATCH = 12;
const MAX_REASON = 80;
const MAX_FEEDBACK = 1_200;

/** One award: which message earned how many points, and why. Public: spectators see the breakdown too. */
export const pointAward = table(
  { name: 'point_award', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    chatId: t.u64().index('btree'),
    side: t.string(),
    messageId: t.u64(),
    points: t.u32(),
    reason: t.string(),
    createdAt: t.timestamp(),
  }
);

/** Per comp chat: how many messages (in chat order) have been scored, and whether the result is final. */
export const scoreState = table(
  { name: 'score_state', public: true },
  {
    chatId: t.u64().primaryKey(),
    scoredCount: t.u32(),
    finalized: t.bool(),
  }
);

export const AwardInput = t.object('AwardInput', { messageId: t.u64(), points: t.u32(), reason: t.string() });

/** A chat's messages in the order they were sent (ties broken by id). */
export function orderedMessages(ctx: Ctx, chatId: bigint) {
  return [...ctx.db.message.chatId.filter(chatId)].sort((x, y) =>
    x.sentAt.microsSinceUnixEpoch === y.sentAt.microsSinceUnixEpoch
      ? Number(x.id - y.id)
      : x.sentAt.microsSinceUnixEpoch < y.sentAt.microsSinceUnixEpoch
        ? -1
        : 1
  );
}

/** Start scoring for a new comp chat. Only chats with a score_state row are ever scored. */
export function startScoring(ctx: Ctx, chatId: bigint) {
  if (!ctx.db.scoreState.chatId.find(chatId)) ctx.db.scoreState.insert({ chatId, scoredCount: 0, finalized: false });
}

/**
 * The chat's scoring record. Comp chats from before points existed (demo chats,
 * debates already decided by the old judging panel) have none and are never
 * re-scored, so their scores and verdicts stay as they were.
 */
function stateFor(ctx: Ctx, chatId: bigint) {
  const state = ctx.db.scoreState.chatId.find(chatId);
  if (!state) throw new SenderError('This debate is not scored with points');
  return state;
}

/**
 * Apply the AI's awards for messages [fromCount, throughCount) of a comp chat.
 * Live chats are scored in full batches of 6; once a chat has ended, the last
 * partial batch may be scored. Caps are re-applied here regardless of input.
 */
export function applyAwards(
  ctx: Ctx,
  chatId: bigint,
  fromCount: number,
  throughCount: number,
  awards: { messageId: bigint; points: number; reason: string }[]
) {
  const c = ctx.db.chat.id.find(chatId);
  if (!c || c.mode !== 'comp') throw new SenderError('Not a comp chat');
  const state = stateFor(ctx, chatId);
  if (state.scoredCount !== fromCount) throw new SenderError('This batch was already scored');
  const msgs = orderedMessages(ctx, chatId);
  const size = throughCount - fromCount;
  if (size <= 0 || size > BATCH_SIZE || throughCount > msgs.length) throw new SenderError('Bad batch range');
  if (c.status !== 'ended' && size !== BATCH_SIZE) throw new SenderError('Live chats are scored in batches of 6');

  const batch = new Map(msgs.slice(fromCount, throughCount).map(m => [m.id, m]));
  const seen = new Set<bigint>();
  const spent = { a: 0, b: 0 };
  let scoreA = c.scoreA;
  let scoreB = c.scoreB;
  for (const a of awards) {
    const m = batch.get(a.messageId);
    if (!m || seen.has(a.messageId)) continue; // only this batch, once per message
    seen.add(a.messageId);
    const side = m.side === 'a' ? 'a' : 'b';
    const points = Math.min(MAX_PER_MESSAGE, Math.max(0, Math.floor(a.points)), MAX_PER_SIDE_PER_BATCH - spent[side]);
    if (points <= 0) continue;
    const reason = a.reason.trim().replace(/\s+/g, ' ').slice(0, MAX_REASON) || 'Constructive point';
    spent[side] += points;
    if (side === 'a') scoreA += points;
    else scoreB += points;
    ctx.db.pointAward.insert({ id: 0n, chatId, side, messageId: m.id, points, reason, createdAt: ctx.timestamp });
  }
  ctx.db.chat.id.update({ ...c, scoreA, scoreB });
  ctx.db.scoreState.chatId.update({ ...state, scoredCount: throughCount });
}

/**
 * Close out an ended comp chat once every message is scored: the side with more
 * points wins (or it's a tie), and the AI's holistic feedback is stored with it.
 */
export function finalizeResult(ctx: Ctx, chatId: bigint, summary: string, feedbackA: string, feedbackB: string) {
  const c = ctx.db.chat.id.find(chatId);
  if (!c || c.mode !== 'comp') throw new SenderError('Not a comp chat');
  if (c.status !== 'ended') throw new SenderError('This debate is still live');
  const state = stateFor(ctx, chatId);
  if (state.finalized) throw new SenderError('Result already recorded');
  if (state.scoredCount !== orderedMessages(ctx, chatId).length) throw new SenderError('Score the remaining messages first');
  const clean = (s: string, max: number) => s.trim().replace(/[ \t]+/g, ' ').slice(0, max);
  // A yield concedes: the other side wins regardless of points.
  const conceded = c.yieldedSide === 'a' || c.yieldedSide === 'b' ? c.yieldedSide : undefined;
  const winner = conceded ? (conceded === 'a' ? 'b' : 'a') : c.scoreA > c.scoreB ? 'a' : c.scoreB > c.scoreA ? 'b' : 'tie';
  const resultJson = JSON.stringify({
    version: 2,
    winner,
    conceded,
    scores: { a: c.scoreA, b: c.scoreB },
    feedback: { a: clean(feedbackA, MAX_FEEDBACK), b: clean(feedbackB, MAX_FEEDBACK) },
  });
  ctx.db.chat.id.update({ ...c, resultJson, summary: clean(summary, 600) || c.summary });
  ctx.db.scoreState.chatId.update({ ...state, finalized: true });
}
