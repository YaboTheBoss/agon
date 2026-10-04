"use client";

/**
 * Feed — "Start chatting" (pick a side on a topic → get paired)
 *        "View convos"   (watch other people's chats via AI summaries)
 * The order of TOPICS stands in for the backend's personalised ranking
 * (popularity + your preferences + view history).
 */

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { Choice, Convo, Mode, Topic } from "@/lib/data";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { AISummary, Avatar, Icon, Loading, ModeTag, PairingOverlay, SignInDialog, PollBar, StatusChip, card, displayFont, press, usePairing } from "@/components/ui";

type Tab = "start" | "convos";

function ModeSwitch({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div role="radiogroup" aria-label="Mode" className="flex rounded-full border-2 border-[#1E1B2E] bg-white p-0.5 shadow-[2px_2px_0_#1E1B2E]">
      {(["casual", "comp"] as Mode[]).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={`min-h-[36px] rounded-full px-3 text-xs font-extrabold transition-colors ${
            mode === m ? (m === "casual" ? "bg-[#7EE0B5] text-[#1E1B2E]" : "bg-[#1E1B2E] text-[#FFD43B]") : "text-[#5E5A72]"
          }`}
        >
          {m === "casual" ? "Casual" : "Comp"}
        </button>
      ))}
    </div>
  );
}

function TopicCard({ topic, onPick }: { topic: Topic; onPick: (t: Topic, choice: Choice) => void }) {
  const { categoryBySlug, convosForTopic, myVotes } = useStore();
  const cat = categoryBySlug(topic.category);
  const chats = convosForTopic(topic.id).length;
  const picked = (myVotes.get(topic.id) as Choice | undefined) ?? null;
  return (
    <li className={`${card} p-4`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {cat && (
          <Link
            href={`/categories/${cat.slug}`}
            className="rounded-full border-2 border-[#1E1B2E] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
            style={{ background: cat.color }}
          >
            {cat.name}
          </Link>
        )}
        {topic.hot && (
          <span className="flex items-center gap-0.5 text-xs font-extrabold text-[#D9480F]">
            <Icon name="flame" className="h-3.5 w-3.5" /> Hot
          </span>
        )}
        {topic.reason && (
          <span className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold text-[#5E5A72]">
            <Icon name="sparkle" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{topic.reason}</span>
          </span>
        )}
      </div>

      <h2 className="mb-3 text-lg font-black leading-snug text-[#1E1B2E]">{topic.title}</h2>

      <PollBar topic={topic} onPick={(c) => onPick(topic, c)} picked={picked} showPct={topic.players > 0} />

      <div className="mt-3 flex items-center justify-between text-xs font-semibold text-[#5E5A72]">
        <span className="flex items-center gap-1">
          <Icon name="users" className="h-3.5 w-3.5" /> {topic.players.toLocaleString()} picked a side
        </span>
        {chats > 0 && (
          <Link href={`/topics/${topic.id}`} className="flex min-h-[32px] items-center gap-1 font-extrabold text-[#1E1B2E] underline decoration-2 underline-offset-2">
            Watch {chats} chat{chats > 1 ? "s" : ""} <Icon name="arrow" className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </li>
  );
}

function ConvoCard({ c }: { c: Convo }) {
  const t = useStore().topicById.get(c.topicId);
  if (!t) return null;
  return (
    <li>
      <Link href={`/convos/${c.id}`} className={`${card} ${press} block p-4`}>
        <div className="mb-2 flex items-center gap-2">
          <ModeTag mode={c.mode} />
          {/* only challenge chats are live / ended */}
          {c.mode === "comp" && c.status && <StatusChip status={c.status} />}
          {c.mode === "comp" && c.scores && (
            <span className="text-xs font-extrabold tabular-nums text-[#1E1B2E]">
              {c.scores.a}–{c.scores.b}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-xs font-extrabold text-[#1E1B2E]">
            <Icon name="heart" className="h-4 w-4 text-[#D6336C]" /> {c.likes}
          </span>
        </div>
        <h2 className="mb-2 text-lg font-black leading-snug">{t.title}</h2>
        <div className="mb-3 flex items-center gap-2 text-xs font-bold">
          <Avatar name={c.a} size={28} color="#8EA2FF" />
          <span className="truncate">{c.a} · {t.sideA}</span>
          <span className={`${displayFont} text-sm text-[#5E5A72]`}>vs</span>
          <Avatar name={c.b} size={28} color="#FFB27A" />
          <span className="truncate">{c.b} · {t.sideB}</span>
        </div>
        {c.summary ? (
          <AISummary text={c.summary} />
        ) : (
          <p className="truncate text-sm text-[#5E5A72]">“{c.messages.at(-1)?.text}”</p>
        )}
      </Link>
    </li>
  );
}

function CreateSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { categories, actions } = useStore();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [sideA, setSideA] = useState("");
  const [sideB, setSideB] = useState("");
  const [category, setCategory] = useState("trending");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    actions
      .createTopic({ title: title.trim(), sideA: sideA.trim(), sideB: sideB.trim(), category })
      .then(onCreated)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Couldn't post that");
        setSaving(false);
      });
  };

  const field = "mt-1 block min-h-[48px] w-full rounded-2xl border-2 border-[#1E1B2E] bg-white px-4 text-[15px] font-semibold placeholder:font-normal placeholder:text-[#8A86A0] focus:outline-none focus:ring-4 focus:ring-[#FFD43B]";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1E1B2E]/40 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        aria-labelledby="create-title"
        className="w-full max-w-md rounded-t-[28px] border-2 border-[#1E1B2E] bg-[#F6F3FF] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] motion-safe:animate-[rise_.25s_ease-out] sm:rounded-[28px] sm:shadow-[6px_6px_0_#1E1B2E]"
      >
        <div className="mb-4 flex items-center">
          <h2 id="create-title" className={`${displayFont} flex-1 text-2xl`}>Start a new debate</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#1E1B2E] bg-white">
            <Icon name="x" />
          </button>
        </div>

        <label className="block text-sm font-extrabold">
          The question
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Is cereal a soup?" maxLength={120} required />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-extrabold">
            Side 1
            <input className={`${field} bg-[#DDE3FF]`} value={sideA} onChange={(e) => setSideA(e.target.value)} placeholder="Yes" maxLength={20} />
          </label>
          <label className="block text-sm font-extrabold">
            Side 2
            <input className={`${field} bg-[#FFE6D3]`} value={sideB} onChange={(e) => setSideB(e.target.value)} placeholder="No" maxLength={20} />
          </label>
        </div>

        <label className="mt-3 block text-sm font-extrabold">
          Category
          <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm font-bold text-[#A3103F]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className={`mt-5 min-h-[52px] w-full rounded-full border-2 border-[#1E1B2E] bg-[#FFD43B] text-base font-black shadow-[4px_4px_0_#1E1B2E] disabled:opacity-60 ${press}`}
        >
          {saving ? "Posting…" : "Post it"}
        </button>
      </form>
    </div>
  );
}

export default function FeedPage() {
  const [tab, setTab] = useState<Tab>("start");
  const [mode, setMode] = useState<Mode>("casual");
  const [creating, setCreating] = useState(false);
  const { pairing, startPairing, cancelPairing } = usePairing();
  const { ready, topics, convos: allConvos } = useStore();
  const { status } = useAuth();
  const signedIn = status === "signed-in";
  const [signingIn, setSigningIn] = useState<string | null>(null);

  const convos = allConvos.filter((c) => c.mode === mode);

  return (
    <>
      <header className="sticky top-0 z-30 border-b-2 border-[#1E1B2E] bg-[#F6F3FF]/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 pb-3 pt-3">
          <div className="flex items-center gap-3">
            <p className={`${displayFont} flex-1 text-[26px] leading-none`}>
              Debate<span className="ml-1 inline-block -rotate-3 rounded-lg border-2 border-[#1E1B2E] bg-[#FFD43B] px-1.5 py-0.5 text-[20px]">Battle</span>
            </p>
            {!signedIn && (
              <button
                onClick={() => setSigningIn("Sign in with Google to pick sides, chat and climb the leaderboard.")}
                className={`min-h-[40px] rounded-full border-2 border-[#1E1B2E] bg-white px-3 text-xs font-black shadow-[2px_2px_0_#1E1B2E] ${press}`}
              >
                Sign in
              </button>
            )}
            <ModeSwitch mode={mode} setMode={setMode} />
          </div>

          <div role="tablist" aria-label="Feed" className="mt-3 grid grid-cols-2 gap-2">
            {([
              { id: "start", label: "Start chatting" },
              { id: "convos", label: "View convos" },
            ] as { id: Tab; label: string }[]).map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`min-h-[44px] rounded-full border-2 border-[#1E1B2E] text-sm font-black transition-all ${
                  tab === t.id ? "bg-[#1E1B2E] text-white" : "bg-white text-[#1E1B2E] shadow-[2px_2px_0_#1E1B2E]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-5">
        {!ready ? (
          <Loading />
        ) : tab === "start" ? (
          <>
            <p className="mb-3 text-sm font-semibold text-[#5E5A72]">
              Pick a side and we&apos;ll pair you with someone from the other one.
            </p>
            <ul className="space-y-4">
              {topics.map((t) => (
                <TopicCard key={t.id} topic={t} onPick={(topic, choice) => startPairing({ topic, choice, mode })} />
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm font-semibold text-[#5E5A72]">
              Showing {mode === "comp" ? "Comp" : "Casual"} chats. Tap one to read it all.
            </p>
            <ul className="space-y-4">
              {convos.map((c) => (
                <ConvoCard key={c.id} c={c} />
              ))}
            </ul>
          </>
        )}
      </main>

      {/* Floating create button (sits above the bottom nav) */}
      <button
        onClick={() => (signedIn ? setCreating(true) : setSigningIn("Sign in with Google to start a new debate."))}
        className={`fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex min-h-[52px] items-center gap-1.5 rounded-full border-2 border-[#1E1B2E] bg-[#FFD43B] px-5 text-base font-black shadow-[4px_4px_0_#1E1B2E] sm:right-[max(1rem,calc(50%-21rem))] ${press}`}
      >
        <Icon name="plus" strokeWidth={3} /> Create
      </button>

      {signingIn && <SignInDialog why={signingIn} onClose={() => setSigningIn(null)} />}

      {creating && (
        <CreateSheet
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setTab("start");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {pairing && <PairingOverlay pairing={pairing} onCancel={cancelPairing} />}
    </>
  );
}
