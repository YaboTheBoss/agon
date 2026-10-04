/**
 * Chat lifetime (casual and comp): a chat is live for 2 days after its first
 * message, then ends. For comp chats, ending triggers the final scoring pass
 * and result (points.ts) through the AI service.
 *
 * The first message starts the chat's clock; a sweep job every minute ends
 * chats whose time is up. sendMessage also refuses expired chats, so nobody
 * can slip a message in between sweeps. Chats from before this existed get
 * their clock from their earliest message on the first sweep.
 *
 * Only new tables live here, so publishing to an existing database migrates
 * without touching data.
 */

import { table, t } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import type { Ctx } from './index';

export const CASUAL_LIFETIME_MICROS = 2n * 86_400_000_000n; // 2 days
export const CASUAL_SWEEP_EVERY_MICROS = 60_000_000n; // 1 minute

/** When each live chat's first message was sent. Rows are removed once the chat ends. */
export const casualClock = table(
  { name: 'casual_clock' },
  {
    chatId: t.u64().primaryKey(),
    firstMessageAt: t.timestamp(),
  }
);

export const casualSweepJob = table(
  { name: 'casual_sweep_job' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const at = (ts: Timestamp) => ts.microsSinceUnixEpoch;

/** Start the 2-day clock on a chat's first message (no-op afterwards). */
export function startCasualClock(ctx: Ctx, chatId: bigint) {
  if (!ctx.db.casualClock.chatId.find(chatId)) ctx.db.casualClock.insert({ chatId, firstMessageAt: ctx.timestamp });
}

/** True once a chat is 2 days past its first message. */
export function casualExpired(ctx: Ctx, chatId: bigint) {
  const clock = ctx.db.casualClock.chatId.find(chatId);
  return !!clock && at(ctx.timestamp) - at(clock.firstMessageAt) >= CASUAL_LIFETIME_MICROS;
}

/** End expired chats; give pre-existing live chats a clock from their first message. */
export function sweepCasualChats(ctx: Ctx) {
  for (const c of [...ctx.db.chat.iter()]) {
    if (c.status !== 'live' || c.msgCount === 0) continue;
    if (ctx.db.casualClock.chatId.find(c.id)) continue;
    const first = [...ctx.db.message.chatId.filter(c.id)].reduce<Timestamp | undefined>(
      (min, m) => (!min || at(m.sentAt) < at(min) ? m.sentAt : min),
      undefined
    );
    ctx.db.casualClock.insert({ chatId: c.id, firstMessageAt: first ?? c.createdAt });
  }
  for (const clock of [...ctx.db.casualClock.iter()]) {
    if (at(ctx.timestamp) - at(clock.firstMessageAt) < CASUAL_LIFETIME_MICROS) continue;
    const c = ctx.db.chat.id.find(clock.chatId);
    if (c && c.status === 'live') ctx.db.chat.id.update({ ...c, status: 'ended' });
    ctx.db.casualClock.chatId.delete(clock.chatId);
  }
}
