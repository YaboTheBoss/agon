"use client";

/**
 * Shared UI kit for the playful mobile style.
 *
 * Palette
 *   ground   #F6F3FF  (lavender mist)     ink    #1E1B2E (text + outlines)
 *   surface  #FFFFFF                       muted  #5E5A72
 *   side 1   #8EA2FF  (periwinkle)         side 2 #FFB27A (peach)
 *   either   #E5DEFF  (lilac)              sun    #FFD43B (AI, highlights)
 *   pink     #FF8FB1  (likes)              mint   #7EE0B5 (casual)
 * Type: Lilita One (display) + Nunito (body), set up in app/layout.tsx.
 * Signature look: 2px ink outlines + hard offset "sticker" shadows that press in on tap.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { bPct, otherSide, sideLabel, type Choice, type CompResult, type CompStatus, type IconName, type Mode, type PointAward, type Side, type Topic } from "@/lib/data";
import { useStore } from "@/lib/store";
import { GoogleButton, useAuth } from "@/lib/auth";

/* ---------------- style tokens ---------------- */

export const card = "rounded-[22px] border-2 border-[#1E1B2E] bg-white shadow-[4px_4px_0_#1E1B2E]";
export const press =
  "transition-[transform,box-shadow] duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_#1E1B2E]";
export const displayFont = "font-[family-name:var(--font-display)] font-normal tracking-[0.01em]";

export const SIDE_COLOR: Record<Side, string> = { a: "#8EA2FF", b: "#FFB27A" };
export const SIDE_TINT: Record<Side, string> = { a: "#DDE3FF", b: "#FFE6D3" };
export const EITHER_COLOR = "#E5DEFF";

/* ---------------- icons ---------------- */

const PATHS: Record<string, string[]> = {
  house: ["M3 10.5 12 3l9 7.5", "M5 9.5V20h14V9.5", "M10 20v-6h4v6"],
  grid: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
  chat: ["M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"],
  trophy: ["M6 9H4.5a2.5 2.5 0 0 1 0-5H6", "M18 9h1.5a2.5 2.5 0 0 0 0-5H18", "M4 22h16", "M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22", "M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8", "M18 2H6v7a6 6 0 0 0 12 0V2z"],
  back: ["M15 18l-6-6 6-6"],
  thumb: ["M7 10v11", "M7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7", "M3 10h4v11H3z"],
  heart: ["M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"],
  sparkle: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z", "M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"],
  plus: ["M12 5v14", "M5 12h14"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  check: ["M5 12l5 5L20 7"],
  arrow: ["M5 12h14", "M12 5l7 7-7 7"],
  send: ["M22 2 11 13", "M22 2l-7 20-4-9-9-4z"],
  shuffle: ["M16 3h5v5", "M4 20 21 3", "M21 16v5h-5", "M15 15l6 6", "M4 4l5 5"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M22 21v-2a4 4 0 0 0-3-3.9", "M16 3.1a4 4 0 0 1 0 7.8"],
  crown: ["M3 18h18", "M3 8l4 4 5-7 5 7 4-4-2 10H5z"],
  bolt: ["M13 2 3 14h9l-1 8 10-12h-9z"],
  flame: ["M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3 0 1.5 1 3 2.5 3z"],
  ball: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7l3.8 2.8-1.5 4.4H9.7L8.2 9.8z", "M12 3v4", "M21 10.5l-5.2-.7", "M3 10.5l5.2-.7", "M14.3 14.2l2.5 4.6", "M9.7 14.2l-2.5 4.6"],
  music: ["M9 18V5l12-2v13", "M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z", "M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"],
  film: ["M4 4h16v16H4z", "M8 4v16", "M16 4v16", "M4 9h4", "M4 15h4", "M16 9h4", "M16 15h4"],
  food: ["M12 3 3 20c6 2 12 2 18 0z", "M10 12h.01", "M14 15h.01", "M12 8h.01"],
  chip: ["M7 7h10v10H7z", "M9 2v3", "M15 2v3", "M9 19v3", "M15 19v3", "M2 9h3", "M2 15h3", "M19 9h3", "M19 15h3"],
  cap: ["M2 9l10-5 10 5-10 5z", "M6 11v5c3 2 9 2 12 0v-5", "M22 9v6"],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M21 21l-4.35-4.35"],
  game: ["M6 8h12a4 4 0 0 1 4 4v2a3 3 0 0 1-5.2 2L15 14H9l-1.8 2A3 3 0 0 1 2 14v-2a4 4 0 0 1 4-4z", "M7 10.5v3", "M5.5 12h3", "M16 11h.01", "M18 13h.01"],
};

export function Icon({ name, className = "h-5 w-5", strokeWidth = 2.2 }: { name: keyof typeof PATHS | IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {(PATHS[name] ?? []).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/* ---------------- avatar / tags ---------------- */

const AVATAR_COLORS = ["#8EA2FF", "#FFB27A", "#7EE0B5", "#FF8FB1", "#FFD43B", "#B9A6FF", "#9BE7F0"];

export function Avatar({ name, size = 36, color }: { name: string; size?: number; color?: string }) {
  const hash = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-[#1E1B2E] font-extrabold text-[#1E1B2E]"
      style={{ width: size, height: size, fontSize: size * 0.42, background: color ?? AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
      aria-hidden="true"
    >
      {name[0]}
    </span>
  );
}

export function ModeTag({ mode }: { mode: Mode }) {
  return mode === "comp" ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[#1E1B2E] bg-[#1E1B2E] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#FFD43B]">
      <Icon name="bolt" className="h-3 w-3" strokeWidth={2.6} /> Comp
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full border-2 border-[#1E1B2E] bg-[#7EE0B5] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#1E1B2E]">
      Casual
    </span>
  );
}

/** Live / Ended — only ever shown for challenge (comp) chats. */
export function StatusChip({ status }: { status: CompStatus }) {
  return status === "live" ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[#1E1B2E] bg-[#FFE0E9] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#A3103F]">
      <span className="h-2 w-2 animate-pulse rounded-full bg-[#D6336C]" /> Live
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full border-2 border-[#1E1B2E] bg-white px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#5E5A72]">
      Ended
    </span>
  );
}

export function AISummary({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[#1E1B2E] bg-[#FFF4C2] px-3 py-2.5">
      <p className="mb-1 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-[#1E1B2E]">
        <Icon name="sparkle" className="h-3.5 w-3.5" /> AI Summary
      </p>
      <p className="text-sm leading-snug text-[#3A3650]">{text}</p>
    </div>
  );
}

/* ---------------- the three-way poll: side 1 · either · side 2 ---------------- */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function PollBar({
  topic,
  onPick,
  picked,
  showPct = true,
}: {
  topic: Pick<Topic, "sideA" | "sideB" | "aPct" | "ePct" | "title">;
  onPick?: (choice: Choice) => void;
  picked?: Choice | null;
  showPct?: boolean;
}) {
  // Widths follow the vote split, clamped so every label stays readable.
  const wA = clamp(topic.aPct, 24, 54);
  const wE = clamp(topic.ePct, 20, 26);
  const wB = 100 - wA - wE;

  const segments: { choice: Choice; label: string; pct: number; width: number; bg: string; align: string }[] = [
    { choice: "a", label: topic.sideA, pct: topic.aPct, width: wA, bg: SIDE_COLOR.a, align: "items-start px-3 text-left" },
    { choice: "either", label: "Either", pct: topic.ePct, width: wE, bg: EITHER_COLOR, align: "items-center px-1 text-center" },
    { choice: "b", label: topic.sideB, pct: bPct(topic), width: wB, bg: SIDE_COLOR.b, align: "items-end px-3 text-right" },
  ];

  return (
    <div className="flex overflow-hidden rounded-full border-2 border-[#1E1B2E] shadow-[3px_3px_0_#1E1B2E]" role="group" aria-label={`Pick a side: ${topic.title}`}>
      {segments.map((s, i) => {
        const chosen = picked === s.choice;
        return (
          <button
            key={s.choice}
            type="button"
            onClick={() => onPick?.(s.choice)}
            aria-pressed={chosen}
            aria-label={`Pick “${s.label}”${showPct ? `, ${s.pct}% picked this` : ""}`}
            style={{ flexBasis: `${s.width}%`, background: s.bg }}
            className={`flex min-h-[52px] min-w-0 shrink-0 grow-0 flex-col justify-center py-1 text-[#1E1B2E] transition-[filter,opacity] hover:brightness-105 ${s.align} ${
              i > 0 ? "border-l-2 border-[#1E1B2E]" : ""
            } ${picked && !chosen ? "opacity-50" : ""}`}
          >
            <span className="flex max-w-full items-center gap-1 text-[13px] font-extrabold leading-tight">
              {chosen && <Icon name="check" className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />}
              <span className="truncate">{s.label}</span>
            </span>
            {showPct && <span className="text-[11px] font-bold leading-tight opacity-70">{s.pct}%</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- challenge-mode point comparison ---------------- */

type ScoreSide = { name: string; side: Side; label: string; score: number; you?: boolean };

/**
 * Comp points bar. With `onPickSide`, each half is a button that opens that
 * side's points breakdown (the chat itself carries no point markers).
 */
export function ScoreBar({
  left,
  right,
  status,
  onPickSide,
}: {
  left: ScoreSide;
  right: ScoreSide;
  status: CompStatus;
  onPickSide?: (side: Side) => void;
}) {
  const total = left.score + right.score;
  const leftPct = total === 0 ? 50 : Math.round((left.score / total) * 100);
  const diff = right.score - left.score;
  const leader = diff === 0 ? null : diff > 0 ? right : left;
  const who = (s: ScoreSide) => (s.you ? "You" : s.name);
  const hi = Math.max(left.score, right.score);
  const lo = Math.min(left.score, right.score);

  const verdict =
    status === "ended"
      ? leader
        ? `${who(leader)} won ${hi}–${lo}`
        : `Tied ${hi}–${lo}`
      : leader
        ? `${leader.you ? "You're" : `${leader.name}'s`} up by ${Math.abs(diff)}`
        : "All square";

  return (
    <div className="relative rounded-2xl border-2 border-[#1E1B2E] bg-white p-3 shadow-[3px_3px_0_#1E1B2E]" aria-label={`Score: ${who(left)} ${left.score}, ${who(right)} ${right.score}. ${verdict}`}>
      {onPickSide && (
        <>
          <button
            type="button"
            onClick={() => onPickSide(left.side)}
            aria-label={`See ${left.you ? "your" : `${left.name}'s`} points breakdown`}
            className="absolute inset-y-0 left-0 z-10 w-1/2 rounded-l-2xl hover:bg-[#1E1B2E]/[0.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFD43B]"
          />
          <button
            type="button"
            onClick={() => onPickSide(right.side)}
            aria-label={`See ${right.you ? "your" : `${right.name}'s`} points breakdown`}
            className="absolute inset-y-0 right-0 z-10 w-1/2 rounded-r-2xl hover:bg-[#1E1B2E]/[0.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFD43B]"
          />
        </>
      )}
      <div className="flex items-center gap-2 text-xs font-extrabold">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <Avatar name={left.name} size={26} color={SIDE_COLOR[left.side]} />
          <span className="truncate">{who(left)}</span>
        </span>
        <StatusChip status={status} />
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <span className="truncate">{who(right)}</span>
          <Avatar name={right.name} size={26} color={SIDE_COLOR[right.side]} />
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className={`${displayFont} w-10 text-3xl leading-none tabular-nums`}>{left.score}</span>
        <div className="flex h-4 flex-1 overflow-hidden rounded-full border-2 border-[#1E1B2E]" aria-hidden="true">
          <div className="h-full transition-[width] duration-500 ease-out" style={{ width: `${leftPct}%`, background: SIDE_COLOR[left.side] }} />
          <div className="h-full flex-1 border-l-2 border-[#1E1B2E]" style={{ background: SIDE_COLOR[right.side] }} />
        </div>
        <span className={`${displayFont} w-10 text-right text-3xl leading-none tabular-nums`}>{right.score}</span>
      </div>

      <div className="mt-1.5 flex items-center gap-2 text-[11px] font-bold text-[#5E5A72]">
        <span className="flex-1 truncate">{left.label}</span>
        <span className="shrink-0 font-extrabold text-[#1E1B2E]">{verdict}</span>
        <span className="flex-1 truncate text-right">{right.label}</span>
      </div>
      {onPickSide && <p className="mt-1 text-center text-[10px] font-bold text-[#8A86A0]">Tap a side to see how its points were earned</p>}
    </div>
  );
}

/** Per-side list of point awards, opened from the score bar. */
export function PointsBreakdown({
  awards,
  names,
  totals,
  initialSide,
  you,
  onClose,
}: {
  awards: PointAward[];
  names: Record<Side, string>;
  totals: Record<Side, number>;
  initialSide: Side;
  /** Which side is the viewer, if they're playing. */
  you?: Side;
  onClose: () => void;
}) {
  const [side, setSide] = useState<Side>(initialSide);
  const list = awards.filter((a) => a.side === side);
  const label = (s: Side) => (s === you ? "You" : names[s]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1E1B2E]/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="breakdown-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-[28px] border-2 border-[#1E1B2E] bg-[#F6F3FF] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] motion-safe:animate-[rise_.25s_ease-out] sm:rounded-[28px] sm:shadow-[6px_6px_0_#1E1B2E]"
      >
        <div className="mb-3 flex items-center">
          <h2 id="breakdown-title" className={`${displayFont} flex-1 text-2xl`}>
            Points breakdown
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#1E1B2E] bg-white">
            <Icon name="x" />
          </button>
        </div>
        <div role="tablist" aria-label="Side" className="mb-3 grid grid-cols-2 gap-2">
          {(["a", "b"] as Side[]).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={side === s}
              onClick={() => setSide(s)}
              className="min-h-[44px] rounded-full border-2 border-[#1E1B2E] text-sm font-black"
              style={{ background: side === s ? SIDE_COLOR[s] : "#FFFFFF" }}
            >
              {label(s)} · {totals[s]}
            </button>
          ))}
        </div>
        <ul className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1">
          {list.length === 0 ? (
            <li className="rounded-2xl border-2 border-dashed border-[#1E1B2E] bg-white px-4 py-4 text-center text-sm font-semibold text-[#3A3650]">
              No points yet. The AI checks every 6 messages and only rewards constructive ones.
            </li>
          ) : (
            list.map((a) => (
              <li key={a.id} className="flex gap-3 rounded-2xl border-2 border-[#1E1B2E] bg-white p-3">
                <span className={`${displayFont} shrink-0 text-xl leading-none text-[#1F7A55]`}>+{a.points}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold">{a.reason}</span>
                  {a.quote && <span className="mt-0.5 block text-xs text-[#5E5A72]">“{a.quote}”</span>}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

/** Final comp result: winner by points, then the AI's feedback for each side. */
export function CompResultCard({ result, names, you }: { result: CompResult; names: Record<Side, string>; you?: Side }) {
  const label = (s: Side) => (s === you ? "You" : names[s]);
  const headline =
    result.winner === "tie"
      ? `Tie, ${result.scores.a}–${result.scores.b}`
      : `${label(result.winner)} ${result.winner === you ? "win" : "wins"} on points, ${Math.max(result.scores.a, result.scores.b)}–${Math.min(result.scores.a, result.scores.b)}`;
  const order: Side[] = you === "b" ? ["b", "a"] : ["a", "b"];
  return (
    <section className={`${card} space-y-3 p-4`} aria-label="Result">
      <p className={`${displayFont} flex items-center gap-2 text-xl`}>
        <Icon name="trophy" className="h-6 w-6" /> {headline}
      </p>
      {order.map((s) =>
        result.feedback[s] ? (
          <div key={s} className="rounded-2xl border-2 border-dashed border-[#1E1B2E] px-3 py-2.5" style={{ background: SIDE_TINT[s] }}>
            <p className="mb-1 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider">
              <Icon name="sparkle" className="h-3.5 w-3.5" /> {s === you ? "Your feedback" : `Feedback for ${names[s]}`}
            </p>
            <p className="whitespace-pre-line text-sm leading-snug text-[#3A3650]">{result.feedback[s]}</p>
          </div>
        ) : null
      )}
    </section>
  );
}

/* ---------------- logo ---------------- */

/** The "yaapi" sticker wordmark. */
export function Logo({ className = "text-[24px]" }: { className?: string }) {
  return (
    <span
      className={`${displayFont} inline-block -rotate-3 rounded-xl border-2 border-[#1E1B2E] bg-[#FFD43B] px-2 py-0.5 leading-none text-[#1E1B2E] shadow-[2px_2px_0_#1E1B2E] ${className}`}
    >
      yaapi
    </span>
  );
}

/* ---------------- page header ---------------- */

/** Sticky page header. `children` render inside it, below the title row (e.g. a search box). */
export function PageHeader({
  title,
  back,
  right,
  sub,
  children,
}: {
  title: ReactNode;
  back?: string;
  right?: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-[#1E1B2E] bg-[#F6F3FF]/95 backdrop-blur">
      <div className="mx-auto max-w-2xl px-4 py-3">
        <div className="flex items-center gap-2">
          {back && <BackButton href={back} />}
          <div className="min-w-0 flex-1">
            <h1 className={`${displayFont} truncate text-2xl leading-tight text-[#1E1B2E]`}>{title}</h1>
            {sub && <div className="truncate text-xs font-semibold text-[#5E5A72]">{sub}</div>}
          </div>
          {right}
        </div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </header>
  );
}

export function BackButton({ href }: { href: string }) {
  return (
    <Link href={href} aria-label="Back" className={`-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#1E1B2E] bg-white shadow-[2px_2px_0_#1E1B2E] ${press}`}>
      <Icon name="back" />
    </Link>
  );
}

/* ---------------- loading / empty ---------------- */

export function Loading({ label = "Loading…" }: { label?: string }) {
  const { connectionError, connected } = useStore();
  const { status, signOut } = useAuth();
  return (
    <div role="status" className="p-6 text-center text-sm font-semibold text-[#5E5A72]">
      <p>{connectionError || !connected ? "Connecting to the server…" : label}</p>
      {/* Escape hatch if the server won't accept this Google sign-in. */}
      {connectionError && status === "signed-in" && (
        <button onClick={signOut} className="mt-3 font-extrabold text-[#1E1B2E] underline">
          Sign out and browse
        </button>
      )}
    </div>
  );
}

/* ---------------- sign in ---------------- */

/** Inline "sign in to play" panel (profile page, chat page). */
export function SignInCard({ why = "Sign in to pick sides, chat and collect likes." }: { why?: string }) {
  return (
    <section className={`${card} p-5 text-center`}>
      <p className={`${displayFont} text-2xl`}>Join the debate</p>
      <p className="mb-4 mt-1 text-sm font-semibold text-[#5E5A72]">{why}</p>
      <GoogleButton />
    </section>
  );
}

/** Modal version, for actions that need an account (pick a side, like, create). */
export function SignInDialog({ why, onClose }: { why: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1E1B2E]/40 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        onClick={(e) => e.stopPropagation()}
        className={`${card} w-full max-w-sm p-6 text-center motion-safe:animate-[rise_.25s_ease-out]`}
      >
        <h2 id="signin-title" className={`${displayFont} text-2xl`}>
          Sign in to play
        </h2>
        <p className="mb-4 mt-1 text-sm text-[#5E5A72]">{why}</p>
        <GoogleButton />
        <button onClick={onClose} className={`mt-4 min-h-[44px] w-full rounded-full border-2 border-[#1E1B2E] bg-white text-sm font-extrabold shadow-[3px_3px_0_#1E1B2E] ${press}`}>
          Not now
        </button>
      </div>
    </div>
  );
}

/* ---------------- pick a side → get paired → chat ---------------- */

export type Pairing = { topic: Pick<Topic, "id" | "title" | "sideA" | "sideB" | "aPct" | "ePct">; choice: Choice; mode: Mode };

export function usePairing() {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  return { pairing, startPairing: setPairing, cancelPairing: () => setPairing(null) };
}

const OPEN_CHAT_AFTER_MS = 1200;

/**
 * Joins the queue for a topic. Two outcomes:
 *  • someone compatible is waiting → "paired!" and we open the chat
 *  • nobody is → you stay in the queue (even if you leave) and get a
 *    notification once someone picks the other side
 */
export function PairingOverlay({ pairing, onCancel }: { pairing: Pairing; onCancel: () => void }) {
  const { status } = useAuth();
  if (status !== "signed-in") {
    return <SignInDialog why="Sign in with Google to pick a side and get paired with someone from the other one." onClose={onCancel} />;
  }
  return <PairingFlow pairing={pairing} onCancel={onCancel} />;
}

function PairingFlow({ pairing, onCancel }: { pairing: Pairing; onCancel: () => void }) {
  const router = useRouter();
  const { actions, myTickets, myChats } = useStore();
  const { topic, choice, mode } = pairing;
  const started = useRef(false);
  // Chats you already had when this overlay opened; anything new on this topic is the pairing.
  const [chatsBefore] = useState(() => new Set(myChats.map((c) => c.id)));
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Join once (the ref survives React's dev-mode double effect).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    actions
      .joinQueue(topic.id, choice, mode)
      .then(() => setJoined(true))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't join the queue"));
  }, [actions, topic.id, choice, mode]);

  // Decide from the rows themselves: a brand-new chat on this topic means we were paired,
  // a ticket means we're waiting.
  const newChat = joined
    ? myChats.filter((c) => c.topic.id === topic.id && c.mode === mode && !chatsBefore.has(c.id)).sort((x, y) => y.createdAt - x.createdAt)[0]
    : undefined;
  const ticket = joined && !newChat ? myTickets.find((tk) => tk.topicId === topic.id && tk.mode === mode) : undefined;
  const state: "joining" | "paired" | "queued" | "error" = error ? "error" : newChat ? "paired" : ticket ? "queued" : "joining";
  const chatId = newChat?.id;

  useEffect(() => {
    if (!chatId) return;
    router.prefetch(`/chat/${chatId}`);
    const t = setTimeout(() => router.push(`/chat/${chatId}`), OPEN_CHAT_AFTER_MS);
    return () => clearTimeout(t);
  }, [chatId, router]);

  const close = () => {
    if (state !== "paired") onCancel();
  };
  const leave = () => {
    if (ticket) actions.leaveQueue(ticket.id).catch(() => {});
    onCancel();
  };

  const assigned: Side = newChat ? newChat.mySide : choice === "either" ? (topic.aPct >= bPct(topic) ? "b" : "a") : choice;
  const mine = sideLabel(topic, assigned);
  const theirs = sideLabel(topic, otherSide(assigned));
  const myShare = choice === "either" ? 0 : choice === "a" ? topic.aPct : bPct(topic);
  const theirShare = choice === "either" ? 0 : choice === "a" ? bPct(topic) : topic.aPct;
  const onMajority = myShare > theirShare;
  const youChip = state !== "paired" && choice === "either" ? { text: "You · Either", bg: EITHER_COLOR } : { text: `You · ${mine}`, bg: SIDE_COLOR[assigned] };

  const heading = {
    joining: "Finding your opponent…",
    paired: "You got paired with another user!",
    queued: "You're in the queue",
    error: "Couldn't join",
  }[state];

  const body = {
    joining: choice === "either" ? "You picked Either, so you can fill whichever side needs a player." : `Looking for someone who picked “${theirs}”.`,
    paired: newChat ? `You're arguing “${mine}” against ${newChat.opponent}. Opening the chat…` : "",
    queued: `Nobody on ${choice === "either" ? "either side" : `“${theirs}”`} is waiting right now. We'll notify you when you get paired — you can keep browsing.${
      onMajority ? ` Most people picked “${mine}”, so this one might take a while.` : ""
    }`,
    error: error ?? "",
  }[state];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1E1B2E]/40 p-3 sm:items-center" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pair-title"
        onClick={(e) => e.stopPropagation()}
        className={`${card} w-full max-w-sm p-6 text-center motion-safe:animate-[rise_.25s_ease-out]`}
      >
        <div className="flex items-center justify-center gap-3">
          <span className="max-w-[40%] truncate rounded-2xl border-2 border-[#1E1B2E] px-3 py-2 text-sm font-extrabold" style={{ background: youChip.bg }}>
            {youChip.text}
          </span>
          <span className={`${displayFont} text-2xl text-[#1E1B2E] ${state === "joining" ? "motion-safe:animate-bounce" : ""}`}>vs</span>
          <span
            className="max-w-[40%] truncate rounded-2xl border-2 border-dashed border-[#1E1B2E] px-3 py-2 text-sm font-extrabold"
            style={{ background: newChat ? SIDE_COLOR[otherSide(assigned)] : "#FFFFFF" }}
          >
            {newChat ? `${newChat.opponent} · ${theirs}` : choice === "either" ? "??? · anyone" : `??? · ${theirs}`}
          </span>
        </div>
        <h2 id="pair-title" className={`${displayFont} mt-5 text-2xl text-[#1E1B2E]`}>
          {heading}
        </h2>
        <p className="mt-1 text-sm text-[#5E5A72]">{body}</p>
        <p className="mt-3 line-clamp-2 text-sm font-bold text-[#1E1B2E]">{topic.title}</p>
        {mode === "comp" && <p className="mt-2 text-xs font-extrabold text-[#5E5A72]">Challenge mode · points on</p>}

        {state === "queued" && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button onClick={leave} className={`min-h-[44px] rounded-full border-2 border-[#1E1B2E] bg-white text-sm font-extrabold shadow-[3px_3px_0_#1E1B2E] ${press}`}>
              Leave queue
            </button>
            <button onClick={onCancel} className={`min-h-[44px] rounded-full border-2 border-[#1E1B2E] bg-[#FFD43B] text-sm font-black shadow-[3px_3px_0_#1E1B2E] ${press}`}>
              Got it
            </button>
          </div>
        )}
        {(state === "joining" || state === "error") && (
          <button onClick={onCancel} className={`mt-5 min-h-[44px] w-full rounded-full border-2 border-[#1E1B2E] bg-white text-sm font-extrabold shadow-[3px_3px_0_#1E1B2E] ${press}`}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
