"use client";

/**
 * Chat — a conversation YOU are in. Same look as the detailed (spectator) page,
 * but with a composer so you can text.
 *
 *  • Casual: just the chat, no points. Ends 2 days after its first message.
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
import type { JudgingResult } from "@/lib/judging/types";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { Avatar, BackButton, Icon, Loading, ModeTag, SignInCard, SIDE_COLOR, SIDE_TINT, displayFont, press } from "@/components/ui";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, myChatById, me, notifications, actions } = useStore();
  const { status, token } = useAuth();
  const chat = myChatById(id);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLLIElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [now, setNow] = useState(0);
  const judgingStarted = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat?.messages.length]);

  // Opening the chat clears its "you got paired" notification.
  const openChatId = chat?.id;
  const hasNotification = !!openChatId && notifications.some((n) => n.chatId === openChatId);
  useEffect(() => {
    if (hasNotification && openChatId) actions.dismissNotifications(openChatId).catch(() => {});
  }, [hasNotification, openChatId, actions]);

  useEffect(() => {
    if (!chat || chat.mode !== "comp" || chat.status === "ended") return;
    const tick = () => {
      setNow(Date.now());
      actions.advanceMatch(chat.id).catch(() => {});
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [chat, actions]);

  useEffect(() => {
    const fallbackReady = !!chat?.phaseStartedAt && now - chat.phaseStartedAt >= 75_000;
    if (!chat || chat.phase !== "judging" || (chat.mySide !== "a" && !fallbackReady) || chat.resultJson || !token || judgingStarted.current) return;
    judgingStarted.current = true;
    const turns = chat.messages.map((message) => {
      const side = message.from === "me" ? chat.mySide : otherSide(chat.mySide);
      return {
        id: message.id,
        phase: message.phase === "opening" || message.phase === "closing" ? message.phase : "engagement",
        speaker: side === "a" ? "player_a" : "player_b",
        text: message.text,
      };
    });
    fetch("/api/judging/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ debateId: chat.id, topic: chat.topic.title, positionA: chat.topic.sideA, positionB: chat.topic.sideB, turns }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? "Judging failed");
        return response.json() as Promise<JudgingResult>;
      })
      .then((result) => actions.submitJudgingResult(chat.id, JSON.stringify(result)))
      .catch((reason: unknown) => {
        judgingStarted.current = false;
        setError(reason instanceof Error ? reason.message : "Judging failed");
      });
  }, [chat, token, actions, now]);

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

  const comp = chat.mode === "comp";
  const ended = chat.status === "ended";
  // Comp is strictly turn-based; casual lets you double-text.
  const simultaneous = comp && (chat.phase === "opening" || chat.phase === "closing");
  const submitted = simultaneous && chat.submitted?.me;
  const waiting = comp && (chat.phase === "judging" || submitted || (chat.phase === "engagement" && chat.turn === "them"));
  const myName = me?.name ?? "You";
  const theirSide = otherSide(chat.mySide);
  const myLabel = sideLabel(chat.topic, chat.mySide);
  const theirLabel = sideLabel(chat.topic, theirSide);
  const phaseElapsed = chat.phaseStartedAt ? Math.max(0, now - chat.phaseStartedAt) : 0;
  const phaseLimit = chat.phase === "opening" ? 120_000 : chat.phase === "closing" ? 90_000 : 90_000;
  const responseLeft = Math.max(0, phaseLimit - phaseElapsed);
  const myEngagementLeft = Math.max(0, (chat.remaining?.me ?? 0) - (chat.phase === "engagement" && chat.turn === "me" ? phaseElapsed : 0));

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
            {comp ? (
              <div className="rounded-2xl border-2 border-[#1E1B2E] bg-white px-3 py-2 text-xs font-extrabold">
                <div className="flex items-center justify-between gap-2">
                  <span className="capitalize">{chat.phase === "judging" ? "Judging…" : chat.phase}</span>
                  {chat.phase === "engagement" ? (
                    <span className="tabular-nums">You {formatTime(myEngagementLeft)} · {chat.opponent} {formatTime(chat.remaining?.them ?? 0)}</span>
                  ) : simultaneous ? <span className="tabular-nums">{formatTime(responseLeft)}</span> : null}
                </div>
                {chat.phase === "engagement" && <p className="mt-1 text-[#5E5A72]">{chat.turn === "me" ? `Your turn · ${formatTime(responseLeft)} response clock` : `${chat.opponent} is responding`}</p>}
                {simultaneous && <p className="mt-1 text-[#5E5A72]">Statements reveal when both players submit.</p>}
              </div>
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
              {comp && <span className="mt-1 block text-xs text-[#5E5A72]">Write your opening privately. It appears when both players submit.</span>}
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
                  {comp && m.phase && <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#5E5A72]">{m.phase}</span>}
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
          {ended ? (
            <p className="py-2 text-center text-sm font-bold">{comp ? "Debate complete." : "This chat has ended. Casual chats close 2 days after the first message."}</p>
          ) : chat.phase === "judging" ? (
            <p className="py-2 text-center text-sm font-extrabold"><Icon name="sparkle" className="mr-1 inline h-4 w-4" />The panel is judging the full debate…</p>
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
                maxLength={simultaneous ? 6000 : 500}
                onPaste={(event) => { if (comp) event.preventDefault(); }}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={submitted ? `Opening submitted · waiting for ${chat.opponent}…` : waiting ? `Waiting for ${chat.opponent}…` : chat.phase === "opening" ? "Write your opening statement…" : chat.phase === "closing" ? "Write your closing statement…" : comp ? "Respond to the argument…" : "Say something…"}
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
              {chat.phase === "engagement" && chat.turn === "me" && (
                <button type="button" onClick={() => actions.yieldEngagement(chat.id)} className="min-h-12 rounded-full border-2 border-[#1E1B2E] bg-white px-3 text-xs font-black">Yield</button>
              )}
            </form>
            </>
          )}
        </div>
      </footer>
      {ended && chat.resultJson && <ResultsSheet resultJson={chat.resultJson} mySide={chat.mySide} opponent={chat.opponent} />}
    </div>
  );
}

function formatTime(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function ResultsSheet({ resultJson, mySide, opponent }: { resultJson: string; mySide: "a" | "b"; opponent: string }) {
  const result = JSON.parse(resultJson) as JudgingResult;
  const mine = mySide === "a" ? "player_a" : "player_b";
  const won = result.panel.winner === mine;
  const tied = result.panel.winner === "tie";
  const myFeedback = mySide === "a" ? result.synthesis.playerA : result.synthesis.playerB;
  const theirFeedback = mySide === "a" ? result.synthesis.playerB : result.synthesis.playerA;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1E1B2E]/60 sm:items-center sm:p-4">
      <section className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[30px] border-2 border-[#1E1B2E] bg-[#F6F3FF] p-6 shadow-[0_-6px_0_#1E1B2E] sm:rounded-[30px]">
        <p className="text-center text-xs font-black uppercase tracking-widest text-[#5E5A72]">Panel decision · {result.panel.voteCounts.player_a}–{result.panel.voteCounts.player_b}</p>
        <h2 className={`${displayFont} mt-2 text-center text-4xl`}>{tied ? "It’s a tie" : won ? "You won!" : `${opponent} won`}</h2>
        <p className="mt-1 text-center font-extrabold capitalize">{result.panel.resultStrength} result</p>
        <p className="mt-5 rounded-2xl border-2 border-[#1E1B2E] bg-white p-4 text-sm font-semibold leading-relaxed">{result.synthesis.explanation}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Feedback title="You" feedback={myFeedback} />
          <Feedback title={opponent} feedback={theirFeedback} />
        </div>
        <details className="mt-4 rounded-2xl border-2 border-[#1E1B2E] bg-white p-4">
          <summary className="cursor-pointer font-black">View full breakdown</summary>
          <div className="mt-3 space-y-3 text-sm"><p><strong>Consensus:</strong> {result.synthesis.consensus.join(" ")}</p><p><strong>Judge disagreement:</strong> {result.synthesis.disagreements.join(" ") || "None noted."}</p><p><strong>Unresolved facts:</strong> {result.synthesis.unresolvedFacts.join(" ") || "None."}</p></div>
        </details>
        <Link href="/" className={`mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 border-[#1E1B2E] bg-[#FFD43B] font-black shadow-[4px_4px_0_#1E1B2E] ${press}`}><Icon name="shuffle" className="h-4 w-4" />New match</Link>
      </section>
    </div>
  );
}

function Feedback({ title, feedback }: { title: string; feedback: { strengths: string[]; improvements: string[] } }) {
  return <div className="rounded-2xl border-2 border-[#1E1B2E] bg-white p-4 text-sm"><h3 className="font-black">{title}</h3><p className="mt-2"><strong>Strength:</strong> {feedback.strengths[0] ?? "—"}</p><p className="mt-2"><strong>Improve:</strong> {feedback.improvements[0] ?? "—"}</p></div>;
}
