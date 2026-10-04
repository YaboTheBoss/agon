"use client";

/**
 * Chat — a conversation YOU are in. Same look as the detailed (spectator) page,
 * but with a composer so you can text.
 *
 *  • Casual: just the chat. No live/ended, no points.
 *  • Comp (challenge): point comparison pinned at the top, a Live/Ended state,
 *    and each message earns points from the AI ref.
 *
 * Routes:
 *  /chat/m3                         → an existing chat from My Chats
 *  /chat/new?topic=…&side=a&mode=…  → a brand-new match from the pairing screen
 */

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ME, MY_CHATS, otherSide, sideLabel, topicById, type MyChat, type Side } from "@/lib/data";
import { Avatar, BackButton, Icon, ModeTag, SIDE_COLOR, SIDE_TINT, ScoreBar, displayFont, press } from "@/components/ui";

/* ---------------- demo stand-ins for the backend ---------------- */

// TODO: replace with the Gemini moderator. Rough local scoring so the demo reacts to what you type.
function scoreArgument(text: string): { pts: number; why: string } {
  if (/\b(stupid|idiot|dumb|clown|loser)\b/i.test(text)) return { pts: -6, why: "Personal attack" };
  if (/\b(fair point|you're right|i agree|to be fair|good point|i see your point)\b/i.test(text)) return { pts: 11, why: "Steelman" };
  if (/\b(because|since|evidence|study|source|data|for example|e\.g\.)\b/i.test(text)) return { pts: text.length > 80 ? 10 : 8, why: "Reasoning" };
  if (text.trim().endsWith("?")) return { pts: 4, why: "Good question" };
  return { pts: text.length > 80 ? 6 : 3, why: "Point made" };
}

// TODO: replace with the real opponent's messages via a Spacetime subscription.
const REPLIES = [
  { text: "Okay, I hear you. But what about the people it doesn't work for?", pts: 5, why: "Good question" },
  { text: "Fair point — I'll give you that. I still think the bigger issue is how it plays out in real life.", pts: 10, why: "Steelman" },
  { text: "Do you have an example? A good one would honestly change my mind.", pts: 4, why: "Good question" },
  { text: "I see where you're coming from, but that only works if everyone plays along, and they usually don't.", pts: 7, why: "Reasoning" },
];

function buildNewChat(params: URLSearchParams): MyChat | null {
  const id = params.get("topic") ?? "";
  const known = topicById(id);
  const title = known?.title ?? params.get("t");
  if (!title) return null;
  const mode = params.get("mode") === "comp" ? "comp" : "casual";
  const mySide: Side = params.get("side") === "b" ? "b" : "a";
  return {
    id: "new",
    topic: { id, title, sideA: known?.sideA ?? params.get("sa") ?? "Yes", sideB: known?.sideB ?? params.get("sb") ?? "No" },
    opponent: params.get("opp") || "Leo",
    mySide,
    mode,
    status: mode === "comp" ? "live" : undefined,
    scores: mode === "comp" ? { me: 0, them: 0 } : undefined,
    turn: "me",
    messages: [],
  };
}

/* ---------------- page ---------------- */

export default function ChatPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <ChatScreen />
    </Suspense>
  );
}

function ChatScreen() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const [chat, setChat] = useState<MyChat | null>(() =>
    id === "new" ? buildNewChat(new URLSearchParams(search.toString())) : MY_CHATS.find((c) => c.id === id) ?? null
  );
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const replyIdx = useRef(0);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<HTMLLIElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat?.messages.length, typing]);

  useEffect(
    () => () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    },
    []
  );

  if (!chat) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center">
        <p className="font-semibold text-[#5E5A72]">This chat doesn&apos;t exist.</p>
        <Link href="/me" className="mt-3 inline-block font-extrabold underline">Back to My Chats</Link>
      </div>
    );
  }

  const comp = chat.mode === "comp";
  const ended = comp && chat.status === "ended";
  const theirSide = otherSide(chat.mySide);
  const myLabel = sideLabel(chat.topic, chat.mySide);
  const theirLabel = sideLabel(chat.topic, theirSide);

  const send = () => {
    const text = draft.trim();
    if (!text || typing || ended) return;
    const award = comp ? scoreArgument(text) : undefined;

    setChat((c) =>
      c && {
        ...c,
        turn: "them",
        messages: [...c.messages, { from: "me", text, pts: award?.pts, why: award?.why }],
        scores: c.scores && award ? { ...c.scores, me: Math.max(0, c.scores.me + award.pts) } : c.scores,
      }
    );
    setDraft("");
    setTyping(true);

    const r = REPLIES[replyIdx.current++ % REPLIES.length];
    replyTimer.current = setTimeout(() => {
      setChat((c) =>
        c && {
          ...c,
          turn: "me",
          messages: [...c.messages, { from: "them", text: r.text, pts: comp ? r.pts : undefined, why: comp ? r.why : undefined }],
          scores: c.scores && comp ? { ...c.scores, them: c.scores.them + r.pts } : c.scores,
        }
      );
      setTyping(false);
    }, 1700);
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
                right={{ name: ME.name, side: chat.mySide, label: myLabel, score: chat.scores.me, you: true }}
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

          {chat.messages.map((m, i) => {
            const mine = m.from === "me";
            const side = mine ? chat.mySide : theirSide;
            return (
              <li key={i} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                <Avatar name={mine ? ME.name : chat.opponent} size={30} color={SIDE_COLOR[side]} />
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

          {typing && (
            <li className="flex items-end gap-2" role="status" aria-label={`${chat.opponent} is typing`}>
              <Avatar name={chat.opponent} size={30} color={SIDE_COLOR[theirSide]} />
              <span className="flex gap-1 rounded-[20px] rounded-bl-md border-2 border-[#1E1B2E] bg-white px-4 py-3.5">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-[#5E5A72]" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
            </li>
          )}
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
                placeholder={typing ? `${chat.opponent} is typing…` : comp ? "Make your point (reasons earn points)" : "Say something…"}
                className="block max-h-36 min-h-[48px] flex-1 resize-none rounded-[24px] border-2 border-[#1E1B2E] bg-[#F6F3FF] px-4 py-3 text-[15px] leading-snug placeholder:text-[#8A86A0] focus:outline-none focus:ring-4 focus:ring-[#FFD43B] field-sizing-content"
              />
              <button
                type="submit"
                disabled={!draft.trim() || typing}
                aria-label="Send"
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#1E1B2E] shadow-[3px_3px_0_#1E1B2E] disabled:opacity-40 ${press}`}
                style={{ background: SIDE_COLOR[chat.mySide] }}
              >
                <Icon name="send" className="h-5 w-5" />
              </button>
            </form>
          )}
        </div>
      </footer>
    </div>
  );
}
