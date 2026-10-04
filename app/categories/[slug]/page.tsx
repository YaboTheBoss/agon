"use client";

/**
 * One category — the most popular topics in that theme.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { topicsForCategory, type Choice } from "@/lib/data";
import { useStore } from "@/lib/store";
import { CompetitiveTopicMark, Icon, Loading, PairingOverlay, PageHeader, PollBar, card, displayFont, usePairing } from "@/components/ui";
import ModeSwitch from "@/components/ModeSwitch";
import { usePlayMode } from "@/lib/play-mode";

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { mode } = usePlayMode();
  const { ready, topics: allTopics, categoryBySlug, convosForTopic, myVotes } = useStore();
  const cat = categoryBySlug(slug);
  const topics = topicsForCategory(allTopics, slug);
  const { pairing, startPairing, cancelPairing } = usePairing();

  if (!ready) {
    return (
      <div className="feed-theme" data-mode={mode}>
        <PageHeader className="feed-header" title="Category" back="/categories" right={<ModeSwitch />} />
        <Loading />
      </div>
    );
  }

  if (!cat) {
    return (
      <div className="feed-theme" data-mode={mode}>
        <PageHeader className="feed-header" title="Not found" back="/categories" right={<ModeSwitch />} />
        <p className="p-6 text-center font-semibold text-[#5E5A72]">No such category.</p>
      </div>
    );
  }

  return (
    <div className="feed-theme" data-mode={mode}>
      <PageHeader className="feed-header" back="/categories" title={cat.name} sub="Most popular right now" right={<ModeSwitch />} />

      <main className="mx-auto max-w-2xl px-4 pt-5">
        {/* banner */}
        <section className="mb-5 flex items-center gap-4 rounded-[22px] border-2 border-[#1E1B2E] p-4 shadow-[4px_4px_0_#1E1B2E]" style={{ background: cat.color }}>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[#1E1B2E] bg-white">
            <Icon name={cat.icon} className="h-7 w-7" />
          </span>
          <span>
            <span className={`${displayFont} block text-2xl leading-none`}>{cat.name}</span>
            <span className="mt-1 block text-sm font-bold text-[#1E1B2E]/80">{cat.blurb}</span>
          </span>
        </section>

        <ol className="space-y-4">
          {topics.map((t, i) => {
            const chats = convosForTopic(t.id).length;
            return (
              <li key={t.id} className={`${card} topic-card relative p-4`}>
                {mode === "comp" && <CompetitiveTopicMark />}
                <div className={`mb-3 flex gap-3 ${mode === "comp" ? "pr-7" : ""}`}>
                  <span className={`${displayFont} w-8 shrink-0 text-3xl leading-none ${mode === "comp" ? "text-[#CBBFD9]" : "text-[#1E1B2E]/30"}`}>{i + 1}</span>
                  <span className="min-w-0">
                    <h2 className="text-lg font-black leading-snug">{t.title}</h2>
                    <p className="topic-meta mt-0.5 text-xs font-semibold text-[#5E5A72]">
                      {t.players.toLocaleString()} picked a side
                      {chats > 0 && (
                        <>
                          {" · "}
                          <Link href={`/topics/${t.id}`} className="topic-convos font-extrabold text-[#1E1B2E] underline decoration-2 underline-offset-2">
                            {chats} chat{chats > 1 ? "s" : ""}
                          </Link>
                        </>
                      )}
                    </p>
                  </span>
                </div>
                <PollBar topic={t} picked={(myVotes.get(t.id) as Choice | undefined) ?? null} onPick={(choice) => startPairing({ topic: t, choice, mode })} />
              </li>
            );
          })}
        </ol>
        {topics.length === 0 && <p className="text-center font-semibold text-[#5E5A72]">No topics here yet — be the first to create one.</p>}
      </main>

      {pairing && <PairingOverlay pairing={pairing} onCancel={cancelPairing} />}
    </div>
  );
}
