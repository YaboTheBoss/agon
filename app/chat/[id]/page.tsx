"use client";

/**
 * Chat — a conversation YOU are in. Same look as the detailed (spectator) page,
 * but with a composer so you can text.
 *
 *  • Both modes: chat freely, live for 2 days after the first message.
 *  • Comp: the AI scores every 6 messages and only rewards constructive ones.
 *    The chat carries no point markers; the points bar at the top shows the
 *    totals, and tapping a side opens how its points were earned. When the
 *    chat ends, the side with more points wins and the AI writes feedback.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { otherSide, sideLabel, type Side } from "@/lib/data";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { requestScoring } from "@/lib/tagging/client";
import {
  Avatar, BackButton, CompResultCard, Icon, Loading, ModeTag, PointsBreakdown, ScoreBar, SignInCard, SIDE_COLOR, SIDE_TINT, displayFont, press,
} from "@/components/ui";

/** Must match the batch size in spacetimedb/src/points.ts. */
const BATCH_SIZE = 6;

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, myChatById, me, notifications, actions } = useStore();
  const { status, token } = useAuth();
  const chat = myChatById(id);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breakdownSide, setBreakdownSide] = useState<Side | null>(null);
  const endRef = useRef<HTMLLIElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat?.messages.length, chat?.result]);

  // Opening the chat clears its "you got paired" notification.
  const openChatId = chat?.id;
  const hasNotification = !!openChatId && notifications.some((n) => n.chatId === openChatId);
  useEffect(() => {
    if (hasNotification && openChatId) actions.dismissNotifications(openChatId).catch(() => {});
  }, [hasNotification, openChatId, actions]);

  // Comp: wake the AI referee when a batch of 6 is waiting, or when an ended
  // debate still needs its final scoring / result.
  const comp = chat?.mode === "comp";
  const ended = chat?.status === "ended";
  const unscored = comp ? (chat?.messages.length ?? 0) - (chat?.scoredCount ?? 0) : 0;
  const needsAi = comp && (unscored >= BATCH_SIZE || (ended && (unscored > 0 || !chat?.result)));
  const messageCount = chat?.messages.length ?? 0;
  useEffect(() => {
    if (needsAi) requestScoring(token);
  }, [needsAi, messageCount, token]);

  if (status === "signed-out") {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-6">
        <SignInCard why="Sign in with Google to open your chats." />
      </main>
    );
  }

  if (!ready) {
    return <Loading />;
  }

  if (!chat) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center">
        <p className="font-semibold text-[#5E5A72]">This chat doesn&apos;t exist, or you&apos;re not in it.</p>
        <Link href="/me" className="mt-3 inline-block font-extrabold underline">Back to My yaapi</Link>
      </div>
    );
  }

  const myName = me?.name ?? "You";
  const theirSide = otherSide(chat.mySide);
  const myLabel = sideLabel(chat.topic, chat.mySide);
  const theirLabel = sideLabel(chat.topic, theirSide);
  const names: Record<Side, string> = chat.mySide === "a" ? { a: myName, b: chat.opponent } : { a: chat.opponent, b: myName };
  const totals: Record<Side, number> =
    chat.mySide === "a" ? { a: chat.scores?.me ?? 0, b: chat.scores?.them ?? 0 } : { a: chat.scores?.them ?? 0, b: chat.scores?.me ?? 0 };

  const send = () => {
    const text = draft.trim();
    if (!text || sending || ended) return;
    setSending(true);
    setError(null);
    setDraft("");
    actions
      .sendMessage(chat.id, text)
      .catch((e: unknown) => {
        setDraft(text);
        setError(e instanceof Error ? e.message : "Couldn't send that");
      })
      .finally(() => {
        setSending(false);
        inputRef.current?.focus();
      });
  };

  return (
    <div className="flex h-[100dvh] flex-col">
      {/* ---------- header ---------- */}
      <header className="z-20 shrink-0 border-b-2 border-[#1E1B2E] bg-[#F6F3FF]">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <BackButton href="/me" />
            <div className="min-w-0 flex-1">
              <h1 className={`${displayFont} line-clamp-2 text-lg leading-tight`}>{chat.topic.title}</h1>
              <p className="truncate text-xs font-semibold text-[#5E5A72]">with {chat.opponent}</p>
            </div>
            <ModeTag mode={chat.mode} />
          </div>

          <div className="mt-3">
            {comp && chat.scores && chat.status ? (
              <ScoreBar
                status={chat.status}
                left={{ name: chat.opponent, side: theirSide, label: theirLabel, score: chat.scores.them }}
                right={{ name: myName, side: chat.mySide, label: myLabel, score: chat.scores.me, you: true }}
                onPickSide={setBreakdownSide}
              />
            ) : (
              // casual: just show who's on which side
              <div className="flex items-center justify-between gap-2 text-xs font-extrabold">
                <span className="truncate rounded-full border-2 border-[#1E1B2E] px-2.5 py-1" style={{ background: SIDE_COLOR[theirSide] }}>
                  {chat.opponent} · {theirLabel}
                </span>
                <span className={`${displayFont} text-sm text-[#5E5A72]`}>vs</span>
                <span className="truncate rounded-full border-2 border-[#1E1B2E] px-2.5 py-1" style={{ background: SIDE_COLOR[chat.mySide] }}>
                  You · {myLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---------- messages ---------- */}
      <main className="flex-1 overflow-y-auto" aria-live="polite">
        <ol className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4" aria-label="Messages">
          {chat.messages.length === 0 && (
            <li className="mx-auto max-w-xs rounded-2xl border-2 border-dashed border-[#1E1B2E] bg-white px-4 py-3 text-center text-sm font-semibold text-[#3A3650]">
              You&apos;re on <strong>“{myLabel}”</strong>. {chat.opponent} picked <strong>“{theirLabel}”</strong>. Say hi and make your opening point.
              <span className="mt-1 block text-xs text-[#5E5A72]">
                {comp
                  ? "Chat freely for 2 days. An AI referee scores every 6 messages and only rewards real arguments, rebuttals and well-used evidence. Most points wins."
                  : "This chat stays open for 2 days after the first message."}
              </span>
            </li>
          )}

          {chat.messages.map((m) => {
            const mine = m.from === "me";
            const side = mine ? chat.mySide : theirSide;
            return (
              <li key={m.id} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                <Avatar name={mine ? myName : chat.opponent} size={30} color={SIDE_COLOR[side]} />
                <p
                  className={`max-w-[78%] whitespace-pre-wrap rounded-[20px] border-2 border-[#1E1B2E] px-4 py-2.5 text-[15px] leading-snug shadow-[2px_2px_0_#1E1B2E] ${
                    mine ? "rounded-br-md" : "rounded-bl-md"
                  }`}
                  style={{ background: SIDE_TINT[side] }}
                >
                  <span className="sr-only">{mine ? "You" : chat.opponent}: </span>
                  {m.text}
                </p>
              </li>
            );
          })}

          {comp && ended && (
            <li>
              {chat.result ? (
                <CompResultCard result={chat.result} names={names} you={chat.mySide} />
              ) : (
                <p className="rounded-2xl border-2 border-dashed border-[#1E1B2E] bg-white px-4 py-3 text-center text-sm font-semibold text-[#3A3650]">
                  <Icon name="sparkle" className="mr-1 inline h-4 w-4" />
                  Time&apos;s up. The referee is scoring the last messages and writing your feedback…
                </p>
              )}
            </li>
          )}
          <li ref={endRef} aria-hidden="true" className="h-0" />
        </ol>
      </main>

      {/* ---------- composer / ended ---------- */}
      <footer className="shrink-0 border-t-2 border-[#1E1B2E] bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl px-4 pt-3">
          {ended ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-sm font-bold">
                {comp ? "This debate has ended." : "This chat has ended."}
                <span className="block text-xs font-semibold text-[#5E5A72]">Chats close 2 days after the first message.</span>
              </p>
              <Link
                href="/"
                className={`flex min-h-[48px] items-center gap-1.5 rounded-full border-2 border-[#1E1B2E] bg-[#FFD43B] px-5 text-sm font-black shadow-[3px_3px_0_#1E1B2E] ${press}`}
              >
                <Icon name="shuffle" className="h-4 w-4" /> New match
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <p role="alert" className="mb-2 text-xs font-bold text-[#A3103F]">
                  {error}
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-end gap-2"
              >
                <label htmlFor="msg" className="sr-only">
                  Message
                </label>
                <textarea
                  id="msg"
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  maxLength={500}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={comp ? "Make your case…" : "Say something…"}
                  className="block max-h-36 min-h-[48px] flex-1 resize-none rounded-[24px] border-2 border-[#1E1B2E] bg-[#F6F3FF] px-4 py-3 text-[15px] leading-snug placeholder:text-[#8A86A0] focus:outline-none focus:ring-4 focus:ring-[#FFD43B] field-sizing-content"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  aria-label="Send"
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#1E1B2E] shadow-[3px_3px_0_#1E1B2E] disabled:opacity-40 ${press}`}
                  style={{ background: SIDE_COLOR[chat.mySide] }}
                >
                  <Icon name="send" className="h-5 w-5" />
                </button>
              </form>
            </>
          )}
        </div>
      </footer>

      {breakdownSide && chat.awards && (
        <PointsBreakdown
          awards={chat.awards}
          names={names}
          totals={totals}
          initialSide={breakdownSide}
          you={chat.mySide}
          onClose={() => setBreakdownSide(null)}
        />
      )}
    </div>
  );
}
