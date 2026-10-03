"use client";

/**
 * Debate Battleground — The Arena (Live Match · VS The Troll, Competitive)
 * Next.js App Router + Tailwind CSS. Mobile-first.
 *
 * Drop in at `app/arena/page.tsx`. No extra dependencies.
 * Everything below is simulated locally so the demo runs offline;
 * the TODOs mark where Spacetime + Gemini plug in.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/* Palette (same as Home)                                             */
/*  bg #0B0D12 · surface #141821 · surface-2 #1B2030 · line #262C3B   */
/*  text #EEF1F6 · muted #9AA3B5 · pro #4C8DFF · con #FF8A3D          */
/*  coin #F5C451 · casual/teal #2DD4BF · fallacy red #FF5C5C          */
/* ------------------------------------------------------------------ */

const TURN_SECONDS = 90;
const CHALLENGE_COST = 50;

const TOPIC = "Social media companies should verify the age of every user.";

const FALLACIES = {
  ad_hominem: {
    label: "Ad Hominem",
    rule: "Rule 2 · Attack the argument, not the arguer",
    why: "Dismisses your case by attacking your experience instead of engaging your reasoning.",
    bonus: 15,
    penalty: 10,
    keywords: ["ad hominem", "personal attack", "attacking me", "attack me"],
  },
  straw_man: {
    label: "Straw Man",
    rule: "Rule 4 · Represent your opponent accurately",
    why: "Recasts “verify age with privacy-preserving checks” as “government reads every DM” — a position you never took.",
    bonus: 10,
    penalty: 8,
    keywords: ["straw man", "strawman", "never said", "misrepresent"],
  },
  false_equivalence: {
    label: "False Equivalence",
    rule: "Rule 6 · Compare like with like",
    why: "Treats in-person cigarette sales and platform-level account checks as the same enforcement problem.",
    bonus: 10,
    penalty: 8,
    keywords: ["false equivalence", "not the same", "different", "apples"],
  },
} as const;

type FallacyKey = keyof typeof FALLACIES;
type Segment = string | { text: string; fallacy: FallacyKey };

type Message =
  | { id: number; kind: "user"; text: string; time: string }
  | { id: number; kind: "troll"; parts: Segment[]; time: string }
  | { id: number; kind: "phase"; text: string }
  | { id: number; kind: "flag"; fallacies: FallacyKey[] }
  | { id: number; kind: "bonus"; points: number; title: string; detail: string };

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never; // distributes over the union
type NewMessage = WithoutId<Message>;

type Alert =
  | { kind: "flag"; fallacy: FallacyKey; quote: string }
  | { kind: "bonus"; points: number; title: string; detail: string };

/* ------------------------------------------------------------------ */
/* Seeded, in-progress debate                                         */
/* ------------------------------------------------------------------ */

const SEED: Message[] = [
  { id: 1, kind: "phase", text: "Phase 1 · Opening statements — you argue PRO" },
  {
    id: 2,
    kind: "user",
    time: "3:41 PM",
    text:
      "Platforms should verify every user's age. 1) They already infer age to target ads, so the capability exists. 2) Public-health bodies have flagged real risks of heavy social media use for young teens. 3) Privacy-preserving checks — on-device age estimation, third-party tokens — mean verification doesn't have to mean uploading an ID.",
  },
  { id: 3, kind: "bonus", points: 12, title: "Clean structure", detail: "Claim + three warrants + evidence" },
  { id: 4, kind: "phase", text: "Phase 2 · The Troll responds" },
  {
    id: 5,
    kind: "troll",
    time: "3:42 PM",
    parts: [
      { text: "Lol, typical take from someone who's never shipped a real product.", fallacy: "ad_hominem" },
      " ",
      { text: "So you basically want the government reading every teenager's DMs.", fallacy: "straw_man" },
      " Age verification is just censorship with extra steps.",
    ],
  },
  { id: 6, kind: "flag", fallacies: ["ad_hominem", "straw_man"] },
  { id: 7, kind: "phase", text: "Phase 3 · Your rebuttal — call out fallacies for bonus points" },
];

const TROLL_REPLY: Segment[] = [
  "Fine, whatever. But ",
  { text: "they put age limits on cigarettes and teens still smoked, so age checks online are pointless too.", fallacy: "false_equivalence" },
  " Nobody can enforce this. Checkmate.",
];

const now = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/* ------------------------------------------------------------------ */
/* Icons                                                              */
/* ------------------------------------------------------------------ */

function Icon({ d, className = "h-5 w-5" }: { d: string[]; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}
const I = {
  back: ["M15 18l-6-6 6-6"],
  bot: ["M12 8V4H8", "M4 8h16v12H4z", "M2 14h2", "M20 14h2", "M15 13v2", "M9 13v2"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "M12 8v4", "M12 16h.01"],
  spark: ["M12 3l1.9 5.8L20 10.7l-5 3.6 1.9 5.7-4.9-3.6-4.9 3.6L9 14.3l-5-3.6 6.1-1.9z"],
  send: ["M22 2 11 13", "M22 2l-7 20-4-9-9-4z"],
  coin: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  flag: ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"],
};

/* ------------------------------------------------------------------ */
/* Header: opponent + synchronized turn timer + scoreboard            */
/* ------------------------------------------------------------------ */

function ArenaHeader({
  secondsLeft,
  turn,
  scores,
}: {
  secondsLeft: number;
  turn: "user" | "troll";
  scores: { you: number; troll: number };
}) {
  const pct = (secondsLeft / TURN_SECONDS) * 100;
  const low = secondsLeft <= 15;
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <header className="sticky top-0 z-30 border-b border-[#1E2330] bg-[#0B0D12]/95 backdrop-blur">
      <div className="mx-auto max-w-3xl px-3 pt-2 sm:px-4">
        <div className="flex items-center gap-2">
          <Link href="/" aria-label="Leave match" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#C7CDD9] hover:bg-[#141821]">
            <Icon d={I.back} />
          </Link>

          {/* Opponent */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF8A3D] text-[#0B0D12]">
              <Icon d={I.bot} />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0B0D12] bg-[#2DD4BF]" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-[family-name:var(--font-display)] text-base font-bold leading-tight">The Troll</span>
              <span className="block truncate text-xs text-[#9AA3B5]">AI bot · Bad-faith specialist</span>
            </span>
          </div>

          {/* Turn timer */}
          <div
            role="timer"
            aria-live="off"
            aria-label={`${turn === "user" ? "Your" : "The Troll's"} turn, ${secondsLeft} seconds left`}
            className={`flex shrink-0 flex-col items-end rounded-xl px-3 py-1 ${low && turn === "user" ? "bg-[#3A1414]" : "bg-[#141821]"}`}
          >
            <span className={`font-[family-name:var(--font-display)] text-xl font-extrabold tabular-nums leading-none ${low && turn === "user" ? "text-[#FF5C5C]" : "text-[#EEF1F6]"}`}>
              {mm}:{ss}
            </span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#9AA3B5]">
              {turn === "user" ? "Your turn" : "Troll's turn"}
            </span>
          </div>
        </div>

        {/* Scoreboard */}
        <div className="mt-2 flex items-center gap-3 pb-2 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-[#4C8DFF]">
            <span className="h-2 w-2 rounded-full bg-[#4C8DFF]" /> You · PRO
            <span className="font-[family-name:var(--font-display)] text-base tabular-nums text-[#EEF1F6]">{scores.you}</span>
          </span>
          <span className="flex-1 truncate text-center text-[11px] font-medium text-[#6B7489]">Ranked · {TOPIC}</span>
          <span className="flex items-center gap-1.5 text-[#FF8A3D]">
            <span className="font-[family-name:var(--font-display)] text-base tabular-nums text-[#EEF1F6]">{scores.troll}</span>
            CON · Troll <span className="h-2 w-2 rounded-full bg-[#FF8A3D]" />
          </span>
        </div>
      </div>

      {/* synchronized timer bar */}
      <div className="h-1 bg-[#141821]">
        <div
          className={`h-full transition-[width] duration-1000 ease-linear ${turn === "troll" ? "bg-[#FF8A3D]" : low ? "bg-[#FF5C5C]" : "bg-[#4C8DFF]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Chat pieces                                                        */
/* ------------------------------------------------------------------ */

function TrollBubble({ parts, time, onFallacyClick }: { parts: Segment[]; time: string; onFallacyClick: (f: FallacyKey, quote: string) => void }) {
  return (
    <div className="flex max-w-[88%] items-end gap-2 sm:max-w-[75%]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF8A3D] text-[#0B0D12]">
        <Icon d={I.bot} className="h-4 w-4" />
      </span>
      <div>
        <div className="rounded-2xl rounded-bl-md border border-[#262C3B] bg-[#141821] px-4 py-3 text-[15px] leading-relaxed text-[#EEF1F6]">
          {parts.map((p, i) =>
            typeof p === "string" ? (
              <span key={i}>{p}</span>
            ) : (
              <button
                key={i}
                onClick={() => onFallacyClick(p.fallacy, p.text)}
                className="inline rounded bg-[#FF5C5C]/15 px-0.5 text-left text-[#FFB3B3] underline decoration-[#FF5C5C] decoration-wavy decoration-2 underline-offset-4 hover:bg-[#FF5C5C]/25"
                aria-label={`${FALLACIES[p.fallacy].label} flagged: ${p.text}`}
              >
                {p.text}
                <span className="ml-1 inline-block translate-y-[-1px] rounded bg-[#FF5C5C] px-1 py-px align-middle text-[10px] font-bold uppercase not-italic tracking-wide text-[#0B0D12] no-underline">
                  {FALLACIES[p.fallacy].label}
                </span>
              </button>
            )
          )}
        </div>
        <span className="mt-1 block pl-1 text-[11px] text-[#6B7489]">The Troll · {time}</span>
      </div>
    </div>
  );
}

function UserBubble({ text, time }: { text: string; time: string }) {
  return (
    <div className="ml-auto flex max-w-[88%] flex-col items-end sm:max-w-[75%]">
      <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#4C8DFF] px-4 py-3 text-[15px] leading-relaxed text-[#0B0D12]">{text}</div>
      <span className="mt-1 pr-1 text-[11px] text-[#6B7489]">You · {time}</span>
    </div>
  );
}

function PhaseDivider({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#6B7489]">
      <span className="h-px flex-1 bg-[#1E2330]" />
      <span className="text-center">{text}</span>
      <span className="h-px flex-1 bg-[#1E2330]" />
    </div>
  );
}

function ModeratorFlagCard({ fallacies }: { fallacies: FallacyKey[] }) {
  const total = fallacies.reduce((s, f) => s + FALLACIES[f].penalty, 0);
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-[#5A1F1F] bg-[#1F1214] p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-[#FF8F8F]">
        <Icon d={I.shield} className="h-4 w-4" /> AI Moderator flagged The Troll
        <span className="ml-auto tabular-nums text-[#FF5C5C]">−{total} pts</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {fallacies.map((f) => (
          <span key={f} className="rounded-md bg-[#FF5C5C] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#0B0D12]">
            {FALLACIES[f].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ModeratorBonusCard({ points, title, detail }: { points: number; title: string; detail: string }) {
  return (
    <div className="mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-[#1B4A44] bg-[#0F1F1E] p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2DD4BF] text-[#0B0D12]">
        <Icon d={I.spark} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold text-[#EEF1F6]">{title}</span>
        <span className="block truncate text-xs text-[#9AA3B5]">{detail}</span>
      </span>
      <span className="font-[family-name:var(--font-display)] text-lg font-extrabold text-[#2DD4BF]">+{points}</span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2" role="status" aria-label="The Troll is typing">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF8A3D] text-[#0B0D12]">
        <Icon d={I.bot} className="h-4 w-4" />
      </span>
      <div className="flex gap-1 rounded-2xl rounded-bl-md border border-[#262C3B] bg-[#141821] px-4 py-3.5">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-[#9AA3B5]" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AI Moderator popup (interrupts the chat)                           */
/* ------------------------------------------------------------------ */

function ModeratorPopup({
  alert,
  coins,
  onClose,
  onRebut,
  onChallenge,
  challenge,
}: {
  alert: Alert;
  coins: number;
  onClose: () => void;
  onRebut: (f: FallacyKey) => void;
  onChallenge: () => void;
  challenge: "idle" | "pending" | "upheld";
}) {
  const isFlag = alert.kind === "flag";
  const f = isFlag ? FALLACIES[alert.fallacy] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#05060A]/70 p-3 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mod-title"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md overflow-hidden rounded-3xl border bg-[#141821] shadow-2xl motion-safe:animate-[pop_.25s_ease-out] ${
          isFlag ? "border-[#5A1F1F]" : "border-[#1B4A44]"
        }`}
      >
        {/* banner */}
        <div className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider ${isFlag ? "bg-[#FF5C5C] text-[#0B0D12]" : "bg-[#2DD4BF] text-[#0B0D12]"}`}>
          <Icon d={isFlag ? I.shield : I.spark} className="h-4 w-4" />
          AI Moderator · {isFlag ? "Fallacy detected" : "Score bonus"}
          <button onClick={onClose} aria-label="Dismiss" className="-mr-2 ml-auto flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10">
            <Icon d={I.x} className="h-4 w-4" />
          </button>
        </div>

        {isFlag && f ? (
          <div className="space-y-4 p-5">
            <div>
              <h2 id="mod-title" className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-[#FF5C5C]">{f.label}</h2>
              <p className="mt-1 text-xs font-semibold text-[#9AA3B5]">{f.rule}</p>
            </div>

            {/* audit trail: exact sentence */}
            <blockquote className="rounded-xl border-l-0 bg-[#0B0D12] p-3 text-sm leading-relaxed">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7489]">The Troll said</span>
              <mark className="rounded bg-[#FF5C5C]/20 px-0.5 text-[#FFB3B3] underline decoration-[#FF5C5C] decoration-wavy decoration-2 underline-offset-4">
                {alert.quote}
              </mark>
            </blockquote>

            <p className="text-sm leading-relaxed text-[#C7CDD9]">{f.why}</p>

            <div className="flex items-center gap-3 rounded-xl bg-[#0F1F1E] px-3 py-2.5 text-sm">
              <span className="font-[family-name:var(--font-display)] text-xl font-extrabold text-[#2DD4BF]">+{f.bonus}</span>
              <span className="text-[#C7CDD9]">if you name and address it in your rebuttal</span>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => onRebut(alert.fallacy)}
                className="min-h-[48px] flex-1 rounded-xl bg-[#4C8DFF] px-4 text-sm font-semibold text-[#0B0D12] hover:bg-[#6A9FFF]"
              >
                Rebut it now
              </button>
              <button
                onClick={onChallenge}
                disabled={challenge !== "idle" || coins < CHALLENGE_COST}
                className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#3A3420] bg-[#1F1B10] px-4 text-sm font-semibold text-[#F5C451] hover:bg-[#2A2414] disabled:opacity-60"
              >
                {challenge === "idle" && (
                  <>
                    Challenge the call · <Icon d={I.coin} className="h-4 w-4" /> {CHALLENGE_COST}
                  </>
                )}
                {challenge === "pending" && "Re-evaluating…"}
                {challenge === "upheld" && "Call upheld on review"}
              </button>
            </div>
          </div>
        ) : alert.kind === "bonus" ? (
          <div className="p-6 text-center">
            <p className="font-[family-name:var(--font-display)] text-6xl font-extrabold text-[#2DD4BF]">+{alert.points}</p>
            <h2 id="mod-title" className="mt-2 font-[family-name:var(--font-display)] text-xl font-bold">{alert.title}</h2>
            <p className="mt-1 text-sm text-[#9AA3B5]">{alert.detail}</p>
            <button onClick={onClose} className="mt-5 min-h-[48px] w-full rounded-xl bg-[#EEF1F6] text-sm font-semibold text-[#0B0D12]">
              Keep going
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Composer                                                           */
/* ------------------------------------------------------------------ */

function Composer({
  value,
  setValue,
  onSubmit,
  disabled,
  inputRef,
}: {
  value: string;
  setValue: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const MAX = 600;
  const handle = (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (value.trim() && !disabled) onSubmit();
  };
  const insert = (label: string) => {
    setValue(`${value}${value && !value.endsWith(" ") ? " " : ""}That's a${/^[AEIOU]/.test(label) ? "n" : ""} ${label}. `);
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handle} className="border-t border-[#1E2330] bg-[#0B0D12] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-3xl px-3 pt-2 sm:px-4">
        {/* quick-call chips */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#6B7489]">
            <Icon d={I.flag} className="h-3.5 w-3.5" /> Call out:
          </span>
          {(Object.keys(FALLACIES) as FallacyKey[]).map((k) => (
            <button
              key={k}
              type="button"
              disabled={disabled}
              onClick={() => insert(FALLACIES[k].label)}
              className="min-h-[32px] shrink-0 rounded-full border border-[#5A1F1F] bg-[#1F1214] px-3 text-xs font-semibold text-[#FF8F8F] hover:bg-[#2A1618] disabled:opacity-50"
            >
              {FALLACIES[k].label}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <label htmlFor="argument" className="sr-only">Your argument</label>
          <div className="relative flex-1">
            <textarea
              id="argument"
              ref={inputRef}
              rows={2}
              maxLength={MAX}
              value={value}
              disabled={disabled}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handle(e);
              }}
              placeholder={disabled ? "The Troll is typing…" : "Build your rebuttal. Name the fallacy, then answer the point."}
              className="block max-h-40 min-h-[52px] w-full resize-none rounded-2xl border border-[#262C3B] bg-[#141821] px-4 py-3 pr-14 text-[15px] leading-snug text-[#EEF1F6] placeholder:text-[#6B7489] focus:border-[#4C8DFF] focus:outline-none disabled:opacity-60 field-sizing-content"
            />
            <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] tabular-nums text-[#6B7489]">
              {value.length}/{MAX}
            </span>
          </div>
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className="flex min-h-[52px] shrink-0 items-center gap-2 rounded-2xl bg-[#4C8DFF] px-4 text-sm font-semibold text-[#0B0D12] hover:bg-[#6A9FFF] disabled:bg-[#262C3B] disabled:text-[#6B7489]"
          >
            <Icon d={I.send} className="h-4 w-4" />
            <span className="hidden sm:inline">Submit Argument</span>
            <span className="sm:hidden">Submit</span>
          </button>
        </div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function ArenaPage() {
  const [messages, setMessages] = useState<Message[]>(SEED);
  const [draft, setDraft] = useState("");
  const [turn, setTurn] = useState<"user" | "troll">("user");
  const [secondsLeft, setSecondsLeft] = useState(64);
  const [scores, setScores] = useState({ you: 42, troll: 18 });
  const [coins, setCoins] = useState(1240);
  const [typing, setTyping] = useState(false);
  const [challenge, setChallenge] = useState<"idle" | "pending" | "upheld">("idle");
  // Open on load so the demo starts with the moderator interrupting.
  const [alert, setAlert] = useState<Alert | null>({
    kind: "flag",
    fallacy: "ad_hominem",
    quote: "Lol, typical take from someone who's never shipped a real product.",
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(100);
  const openFallacies = useRef<Set<FallacyKey>>(new Set(["ad_hominem", "straw_man"]));

  // Synchronized turn timer. TODO: drive from Spacetime's server clock instead of setInterval.
  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll to newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const push = (m: NewMessage) => setMessages((prev) => [...prev, { ...m, id: nextId.current++ } as Message]);

  const openFlag = (fallacy: FallacyKey, quote: string) => {
    setChallenge("idle");
    setAlert({ kind: "flag", fallacy, quote });
  };

  const handleChallenge = () => {
    setCoins((c) => c - CHALLENGE_COST);
    setChallenge("pending");
    // TODO: secondary Gemini re-evaluation of the turn.
    setTimeout(() => setChallenge("upheld"), 1400);
  };

  const handleRebut = (f: FallacyKey) => {
    setAlert(null);
    if (!draft.toLowerCase().includes(FALLACIES[f].label.toLowerCase())) {
      setDraft((d) => `${d}${d ? " " : ""}That's a${/^[AEIOU]/.test(FALLACIES[f].label) ? "n" : ""} ${FALLACIES[f].label}. `);
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSubmit = () => {
    const text = draft.trim();
    push({ kind: "user", text, time: now() });
    setDraft("");

    // TODO: send to Gemini moderator. Local stand-in: keyword match on open fallacies.
    const lower = text.toLowerCase();
    const caught = [...openFallacies.current].filter((k) =>
      [FALLACIES[k].label.toLowerCase(), ...FALLACIES[k].keywords].some((kw) => lower.includes(kw))
    );
    caught.forEach((k) => openFallacies.current.delete(k));
    const points = caught.reduce((s, k) => s + FALLACIES[k].bonus, 0);

    if (points > 0) {
      const names = caught.map((k) => FALLACIES[k].label).join(" + ");
      push({ kind: "bonus", points, title: `Fallacy called out`, detail: `${names} identified and addressed` });
      setScores((s) => ({ ...s, you: s.you + points }));
      setAlert({ kind: "bonus", points, title: "Fallacy called out", detail: `You named the ${names} and answered the point.` });
    }

    // Hand the turn to The Troll.
    setTurn("troll");
    setSecondsLeft(TURN_SECONDS);
    setTyping(true);

    setTimeout(() => {
      setTyping(false);
      push({ kind: "troll", parts: TROLL_REPLY, time: now() });
      setTimeout(() => {
        const fe = FALLACIES.false_equivalence;
        openFallacies.current.add("false_equivalence");
        push({ kind: "flag", fallacies: ["false_equivalence"] });
        setScores((s) => ({ ...s, troll: Math.max(0, s.troll - fe.penalty) }));
        const seg = TROLL_REPLY.find((p) => typeof p !== "string") as { text: string; fallacy: FallacyKey };
        openFlag("false_equivalence", seg.text);
        setTurn("user");
        setSecondsLeft(TURN_SECONDS);
      }, 700);
    }, 2400);
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-[#0B0D12] font-[family-name:var(--font-body)] text-[#EEF1F6]">
      <ArenaHeader secondsLeft={secondsLeft} turn={turn} scores={scores} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto" aria-live="polite">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-5 sm:px-4">
          {messages.map((m) => {
            switch (m.kind) {
              case "phase":
                return <PhaseDivider key={m.id} text={m.text} />;
              case "user":
                return <UserBubble key={m.id} text={m.text} time={m.time} />;
              case "troll":
                return <TrollBubble key={m.id} parts={m.parts} time={m.time} onFallacyClick={openFlag} />;
              case "flag":
                return <ModeratorFlagCard key={m.id} fallacies={m.fallacies} />;
              case "bonus":
                return <ModeratorBonusCard key={m.id} points={m.points} title={m.title} detail={m.detail} />;
            }
          })}
          {typing && <TypingIndicator />}
        </div>
      </div>

      <Composer value={draft} setValue={setDraft} onSubmit={handleSubmit} disabled={turn !== "user"} inputRef={inputRef} />

      {alert && (
        <ModeratorPopup
          alert={alert}
          coins={coins}
          challenge={challenge}
          onClose={() => setAlert(null)}
          onRebut={handleRebut}
          onChallenge={handleChallenge}
        />
      )}

      {/* popup entrance animation */}
      <style>{`@keyframes pop{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}