"use client";

/**
 * My Chats ("My playground") — your likes, membership, and the chats you're in.
 * Casual chats show whose turn it is; challenge (comp) chats show Live/Ended + score.
 */

import Link from "next/link";
import { useState } from "react";
import { ME, MY_CHATS, otherSide, type Mode, type MyChat } from "@/lib/data";
import { Avatar, Icon, ModeTag, PageHeader, SIDE_COLOR, StatusChip, card, displayFont, press } from "@/components/ui";

type Filter = "all" | Mode;

function ChatStatus({ c }: { c: MyChat }) {
  if (c.mode === "comp" && c.status && c.scores) {
    const { me, them } = c.scores;
    const result = c.status === "ended" ? (me > them ? "Won " : me < them ? "Lost " : "Tied ") : "";
    return (
      <span className="flex items-center gap-2">
        <StatusChip status={c.status} />
        <span className="text-xs font-extrabold tabular-nums">
          {result}
          {me}–{them}
        </span>
      </span>
    );
  }
  return c.turn === "me" ? (
    <span className="rounded-full border-2 border-[#1E1B2E] bg-[#FFD43B] px-2.5 py-0.5 text-xs font-extrabold">Your turn</span>
  ) : (
    <span className="text-xs font-extrabold text-[#5E5A72]">Waiting for {c.opponent}</span>
  );
}

export default function MyChatsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const chats = MY_CHATS.filter((c) => filter === "all" || c.mode === filter);

  return (
    <>
      <PageHeader title="My playground" />

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-5">
        {/* profile + stats */}
        <section className={`${card} flex items-center gap-4 p-4`}>
          <Avatar name={ME.name} size={64} color="#FFD43B" />
          <div className="min-w-0 flex-1">
            <p className={`${displayFont} text-2xl leading-none`}>{ME.name}</p>
            <p className="text-sm font-semibold text-[#5E5A72]">{ME.handle}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm font-extrabold">
              <span className="flex items-center gap-1 rounded-full border-2 border-[#1E1B2E] bg-[#FF8FB1] px-2.5 py-0.5">
                <Icon name="heart" className="h-4 w-4" /> {ME.likes} likes
              </span>
              <span className="rounded-full border-2 border-[#1E1B2E] bg-white px-2.5 py-0.5">{ME.membership} member</span>
            </div>
          </div>
        </section>

        {/* membership upsell (AI Debate Coach from the proposal) */}
        {ME.membership === "Free" && (
          <section className="flex items-center gap-3 rounded-[22px] border-2 border-[#1E1B2E] bg-[#1E1B2E] p-4 text-white shadow-[4px_4px_0_#FFD43B]">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFD43B] text-[#1E1B2E]">
              <Icon name="sparkle" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-black">Membership: Debate Coach+</span>
              <span className="block text-sm text-white/80">Personal AI feedback after every chat.</span>
            </span>
            <button className={`min-h-[44px] shrink-0 rounded-full border-2 border-[#FFD43B] bg-[#FFD43B] px-4 text-sm font-black text-[#1E1B2E] ${press}`}>
              Try it
            </button>
          </section>
        )}

        {/* my chats */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className={`${displayFont} flex-1 text-xl`}>My chats</h2>
            {(["all", "casual", "comp"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`min-h-[36px] rounded-full border-2 border-[#1E1B2E] px-3 text-xs font-extrabold capitalize ${
                  filter === f ? "bg-[#1E1B2E] text-white" : "bg-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <ul className="space-y-4">
            {chats.map((c) => (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`} className={`${card} ${press} block p-4`}>
                  <div className="flex items-start gap-3">
                    <h3 className="min-w-0 flex-1 text-lg font-black leading-snug">{c.topic.title}</h3>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-[#1E1B2E] bg-[#F6F3FF] py-0.5 pl-0.5 pr-2.5 text-xs font-extrabold">
                      <Avatar name={c.opponent} size={24} color={SIDE_COLOR[otherSide(c.mySide)]} /> {c.opponent}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-[#5E5A72]">
                    {c.messages.at(-1)?.from === "me" ? "You: " : `${c.opponent}: `}
                    {c.messages.at(-1)?.text}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <ChatStatus c={c} />
                    <ModeTag mode={c.mode} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
