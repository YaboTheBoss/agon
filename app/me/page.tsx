"use client";

/**
 * My yaapi ("My playground") — your likes, membership, and the chats you're in.
 * Casual chats show whose turn it is; challenge (comp) chats show Live/Ended + score.
 */

import Link from "next/link";
import { FormEvent, useState } from "react";
import { otherSide, type Mode, type MyChat } from "@/lib/data";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { usePageState } from "@/lib/page-memory";
import { Avatar, Icon, Loading, ModeTag, PageHeader, SignInCard, SIDE_COLOR, StatusChip, card, displayFont, press } from "@/components/ui";

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
  if (c.status === "ended") return <StatusChip status="ended" />;
  return c.turn === "me" ? (
    <span className="rounded-full border-2 border-[#1E1B2E] bg-[#FFD43B] px-2.5 py-0.5 text-xs font-extrabold">Your turn</span>
  ) : (
    <span className="text-xs font-extrabold text-[#5E5A72]">Waiting for {c.opponent}</span>
  );
}

export default function MyChatsPage() {
  const [filter, setFilter] = usePageState<Filter>("me:filter", "all");
  const { ready, me, myChats, myTickets, actions } = useStore();
  const { status, signOut } = useAuth();
  const [editing, setEditing] = usePageState("me:editing", false);
  const [name, setName] = usePageState("me:name", "");
  const [nameError, setNameError] = useState<string | null>(null);
  const chats = myChats.filter((c) => filter === "all" || c.mode === filter);

  if (status === "signed-out") {
    return (
      <>
        <PageHeader title="My playground" />
        <main className="mx-auto max-w-2xl px-4 pt-5">
          <SignInCard why="Sign in with Google to keep your chats, likes and streak on every device." />
        </main>
      </>
    );
  }

  if (!ready || !me) {
    return (
      <>
        <PageHeader title="My playground" />
        <Loading />
      </>
    );
  }

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    setNameError(null);
    actions
      .setName(name)
      .then(() => setEditing(false))
      .catch((err: unknown) => setNameError(err instanceof Error ? err.message : "Couldn't save that name"));
  };

  return (
    <>
      <PageHeader title="My playground" />

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-5">
        {/* profile + stats */}
        <section className={`${card} flex items-center gap-4 p-4`}>
          <Avatar name={me.name} size={64} color="#FFD43B" />
          <div className="min-w-0 flex-1">
            {editing ? (
              <form onSubmit={saveName} className="flex items-center gap-2">
                <label htmlFor="name" className="sr-only">Display name</label>
                <input
                  id="name"
                  autoFocus
                  value={name}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  className="min-h-[40px] min-w-0 flex-1 rounded-xl border-2 border-[#1E1B2E] bg-[#F6F3FF] px-3 font-bold focus:outline-none focus:ring-4 focus:ring-[#FFD43B]"
                />
                <button type="submit" aria-label="Save name" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#1E1B2E] bg-[#7EE0B5]">
                  <Icon name="check" className="h-4 w-4" strokeWidth={3} />
                </button>
                <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#1E1B2E] bg-white">
                  <Icon name="x" className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <p className={`${displayFont} flex items-center gap-2 text-2xl leading-none`}>
                <span className="truncate">{me.name}</span>
                <button
                  onClick={() => {
                    setName(me.name);
                    setNameError(null);
                    setEditing(true);
                  }}
                  className="shrink-0 rounded-full border-2 border-[#1E1B2E] bg-white px-2 py-0.5 font-[family-name:var(--font-body)] text-xs font-extrabold"
                >
                  Edit
                </button>
              </p>
            )}
            {nameError && <p role="alert" className="mt-1 text-xs font-bold text-[#A3103F]">{nameError}</p>}
            <p className="truncate text-sm font-semibold text-[#5E5A72]">
              @{me.username} · {me.debates} chats · {me.streak}-day streak
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm font-extrabold">
              <span className="flex items-center gap-1 rounded-full border-2 border-[#1E1B2E] bg-[#FF8FB1] px-2.5 py-0.5">
                <Icon name="heart" className="h-4 w-4" /> {me.likes} likes
              </span>
              <span className="rounded-full border-2 border-[#1E1B2E] bg-white px-2.5 py-0.5">{me.membership} member</span>
            </div>
          </div>
        </section>

        {/* membership upsell (AI Debate Coach from the proposal) */}
        {me.membership === "Free" && (
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

        {/* waiting for a match */}
        {myTickets.length > 0 && (
          <section>
            <h2 className={`${displayFont} mb-1 text-xl`}>Waiting for a match</h2>
            <p className="mb-3 text-sm font-semibold text-[#5E5A72]">You&apos;ll get a notification when someone from the other side is paired with you.</p>
            <ul className="space-y-3">
              {myTickets.map((tk) => (
                <li key={tk.id} className={`${card} flex items-center gap-3 p-3`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-black">{tk.title}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs font-bold text-[#5E5A72]">
                      <ModeTag mode={tk.mode} />
                      You picked {tk.choice === "either" ? "Either" : `side ${tk.choice.toUpperCase()}`}
                    </span>
                  </span>
                  <button
                    onClick={() => actions.leaveQueue(tk.id).catch(() => {})}
                    className={`min-h-[40px] shrink-0 rounded-full border-2 border-[#1E1B2E] bg-white px-3 text-xs font-extrabold shadow-[2px_2px_0_#1E1B2E] ${press}`}
                  >
                    Leave
                  </button>
                </li>
              ))}
            </ul>
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
        <button
          onClick={signOut}
          className={`mx-auto block min-h-[44px] rounded-full border-2 border-[#1E1B2E] bg-white px-5 text-sm font-extrabold shadow-[2px_2px_0_#1E1B2E] ${press}`}
        >
          Sign out
        </button>
      </main>
    </>
  );
}
