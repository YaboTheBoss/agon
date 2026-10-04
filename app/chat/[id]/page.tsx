"use client";

/**
 * Chat — a conversation YOU are in. Same look as the detailed (spectator) page,
 * but with a composer so you can text.
 *
 *  • Casual: just the chat. No live/ended, no points.
 *  • Comp (challenge): point comparison pinned at the top, a Live/Ended state,
 *    and each message earns points from the AI ref.
 *
 * Messages are sent through the `sendMessage` reducer; the server scores comp
 * messages and ends comp chats at the message limit.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { otherSide, sideLabel } from "@/lib/data";
import { useStore } from "@/lib/store";
import { Avatar, BackButton, Icon, Loading, ModeTag, SIDE_COLOR, SIDE_TINT, ScoreBar, displayFont, press } from "@/components/ui";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, myChatById, me, notifications, actions } = useStore();
  const chat = myChatById(id);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLLIElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat?.messages.length]);

  // Opening the chat clears its "you got paired" notification.
  const openChatId = chat?.id;
  const hasNotification = !!openChatId && notifications.some((n) => n.chatId === openChatId);
  useEffect(() => {
    if (hasNotification && openChatId) actions.dismissNotifications(openChatId).catch(() => {});
  }, [hasNotification, openChatId, actions]);

  if (!ready) {
    return <Loading />;
  }

  if (!chat) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center">
        <p className="font-semibold text-[#5E5A72]">This chat doesn&apos;t exist, or you&apos;re not in it.</p>
        <Link href="/me" className="mt-3 inline-block font-extrabold underline">Back to My Chats</Link>
      </div>
    );
  }

  const comp = chat.mode === "comp";
  const ended = comp && chat.status === "ended";
  // Comp is strictly turn-based; casual lets you double-text.
  const waiting = comp && chat.turn === "them" && chat.messages.length > 0;
  const myName = me?.name ?? "You";
  const theirSide = otherSide(chat.mySide);
  const myLabel = sideLabel(chat.topic, chat.mySide);
  const theirLabel = sideLabel(chat.topic, theirSide);

  const send = () => {
    const text = draft.trim();
    if (!text || sending || ended || waiting) return;
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
              {comp && <span className="mt-1 block text-xs text-[#5E5A72]">Challenge mode: the AI ref scores every message.</span>}
            </li>
          )}

          {chat.messages.map((m) => {
            const mine = m.from === "me";
            const side = mine ? chat.mySide : theirSide;
            return (
              <li key={m.id} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                <Avatar name={mine ? myName : chat.opponent} size={30} color={SIDE_COLOR[side]} />
                <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                  <p
                    className={`whitespace-pre-wrap rounded-[20px] border-2 border-[#1E1B2E] px-4 py-2.5 text-[15px] leading-snug shadow-[2px_2px_0_#1E1B2E] ${
                      mine ? "rounded-br-md" : "rounded-bl-md"
                    }`}
                    style={{ background: SIDE_TINT[side] }}
                  >
                    <span className="sr-only">{mine ? "You" : chat.opponent}: </span>
                    {m.text}
                  </p>
                  {comp && m.pts !== undefined && (
                    <span
                      className={`mt-1 inline-flex items-center gap-1 rounded-full border-2 px-2 py-0.5 text-[11px] font-extrabold ${
                        m.pts >= 0 ? "border-[#1E1B2E] bg-[#C9F5E1] text-[#1E1B2E]" : "border-[#A3103F] bg-[#FFE0E9] text-[#A3103F]"
                      }`}
                    >
                      <Icon name="sparkle" className="h-3 w-3" />
                      {m.pts >= 0 ? `+${m.pts}` : `−${Math.abs(m.pts)}`} {m.why}
                    </span>
                  )}
                </div>
              </li>
            );
          })}

          <li ref={endRef} aria-hidden="true" className="h-0" />
        </ol>
      </main>

      {/* ---------- composer / result ---------- */}
      <footer className="shrink-0 border-t-2 border-[#1E1B2E] bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl px-4 pt-3">
          {ended && chat.scores ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-sm font-extrabold">
                {chat.scores.me > chat.scores.them ? "You won this one." : chat.scores.me < chat.scores.them ? `${chat.opponent} took this one.` : "It's a tie."}
                <span className="block text-xs font-semibold text-[#5E5A72]">This challenge has ended.</span>
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
              <label htmlFor="msg" className="sr-only">Message</label>
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
                placeholder={waiting ? `Waiting for ${chat.opponent}…` : comp ? "Make your point (reasons earn points)" : "Say something…"}
                className="block max-h-36 min-h-[48px] flex-1 resize-none rounded-[24px] border-2 border-[#1E1B2E] bg-[#F6F3FF] px-4 py-3 text-[15px] leading-snug placeholder:text-[#8A86A0] focus:outline-none focus:ring-4 focus:ring-[#FFD43B] field-sizing-content"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending || waiting}
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
    </div>
  );
}
