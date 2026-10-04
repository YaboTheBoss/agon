"use client";

/**
 * Yaaperboard (leaderboard) — people with the most likes / most activity.
 */

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Avatar, Icon, Loading, PageHeader, card, displayFont } from "@/components/ui";

type Sort = "likes" | "debates";

const PODIUM = [
  { place: 2, height: "h-20", color: "#C9D1FF" },
  { place: 1, height: "h-28", color: "#FFD43B" },
  { place: 3, height: "h-14", color: "#FFC9A3" },
];

export default function LeaderboardPage() {
  const [sort, setSort] = useState<Sort>("likes");
  const { ready, leaders } = useStore();
  const ranked = [...leaders].sort((a, b) => b[sort] - a[sort]);
  const unit = sort === "likes" ? "likes" : "chats";
  const myIndex = ranked.findIndex((p) => p.you);
  const myRow = ranked[myIndex];
  // Distance to the next milestone: the top 20, or the spot right above you once you're in it.
  const target = myIndex >= 20 ? ranked[19] : myIndex > 0 ? ranked[myIndex - 1] : undefined;
  const gap = target && myRow ? target[sort] - myRow[sort] + 1 : 0;
  const tip = !myRow
    ? ""
    : myIndex === 0
      ? "You're #1. Defend it."
      : `${gap} more ${sort === "likes" ? "likes" : "chats"} to ${myIndex >= 20 ? "crack the top 20" : `pass ${target!.name}`}`;

  if (!ready) {
    return (
      <>
        <PageHeader title="Yaaperboard" sub="All time" />
        <Loading />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Yaaperboard" sub="All time" />

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-5">
        <div role="radiogroup" aria-label="Rank by" className="grid grid-cols-2 gap-2">
          {([
            { id: "likes", label: "Most liked" },
            { id: "debates", label: "Most active" },
          ] as { id: Sort; label: string }[]).map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={sort === s.id}
              onClick={() => setSort(s.id)}
              className={`min-h-[44px] rounded-full border-2 border-[#1E1B2E] text-sm font-black ${
                sort === s.id ? "bg-[#1E1B2E] text-white" : "bg-white shadow-[2px_2px_0_#1E1B2E]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* podium */}
        <section aria-label="Top 3" className="grid grid-cols-3 items-end gap-2 pt-4">
          {PODIUM.map(({ place, height, color }) => {
            const p = ranked[place - 1];
            if (!p) return <div key={place} />;
            return (
              <div key={place} className="flex flex-col items-center">
                {place === 1 && <Icon name="crown" className="mb-1 h-7 w-7 text-[#1E1B2E]" />}
                <Avatar name={p.name} size={place === 1 ? 64 : 52} />
                <p className="mt-1 max-w-full truncate text-sm font-black">{p.name}</p>
                <p className="text-xs font-bold text-[#5E5A72]">
                  {p[sort].toLocaleString()} {unit}
                </p>
                <div
                  className={`mt-2 flex w-full items-start justify-center rounded-t-2xl border-2 border-b-0 border-[#1E1B2E] pt-2 ${height}`}
                  style={{ background: color }}
                >
                  <span className={`${displayFont} text-3xl leading-none`}>{place}</span>
                </div>
              </div>
            );
          })}
        </section>

        {/* the rest */}
        <ol className={`${card} -mt-5 divide-y-2 divide-[#1E1B2E]/10 overflow-hidden`} start={4}>
          {ranked.slice(3, 20).map((p, i) => (
            <li key={p.id} className={`flex items-center gap-3 px-4 py-3 ${p.you ? "bg-[#FFF4C2]" : ""}`}>
              <span className={`${displayFont} w-7 text-xl text-[#1E1B2E]/40`}>{i + 4}</span>
              <Avatar name={p.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-black">{p.you ? `${p.name} (you)` : p.name}</span>
                <span className="block text-xs font-semibold text-[#5E5A72]">{p.streak}-day streak</span>
              </span>
              <span className="text-sm font-extrabold">
                {p[sort].toLocaleString()} <span className="font-semibold text-[#5E5A72]">{unit}</span>
              </span>
            </li>
          ))}
        </ol>

        {/* you */}
        {myRow && (
        <section className="flex items-center gap-3 rounded-[22px] border-2 border-[#1E1B2E] bg-[#FFD43B] px-4 py-3 shadow-[4px_4px_0_#1E1B2E]">
          <span className={`${displayFont} w-10 text-xl`}>#{myIndex + 1}</span>
          <Avatar name={myRow.name} size={36} color="#FFFFFF" />
          <span className="min-w-0 flex-1">
            <span className="block font-black">You</span>
            <span className="block text-xs font-bold text-[#1E1B2E]/75">{tip}</span>
          </span>
          <span className="text-sm font-extrabold">
            {myRow[sort].toLocaleString()} {unit}
          </span>
        </section>
        )}
      </main>
    </>
  );
}
