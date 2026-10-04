"use client";

/**
 * Topic threads — every conversation happening on one topic.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { categoryBySlug, convosForTopic, topicById } from "@/lib/data";
import { Avatar, Icon, ModeTag, PairingOverlay, PageHeader, PollBar, StatusChip, card, press, usePairing } from "@/components/ui";

export default function TopicPage() {
  const { id } = useParams<{ id: string }>();
  const topic = topicById(id);
  const { pairing, startPairing, cancelPairing } = usePairing();

  if (!topic) {
    return (
      <>
        <PageHeader title="Topic not found" back="/" />
        <p className="p-6 text-center font-semibold text-[#5E5A72]">We couldn&apos;t find that topic.</p>
      </>
    );
  }

  const cat = categoryBySlug(topic.category);
  const chats = [...convosForTopic(topic.id)].sort((a, b) => b.likes - a.likes);

  return (
    <>
      <PageHeader back="/" title="Chats on this topic" sub={cat?.name} />

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-5">
        <section className={`${card} p-4`} style={{ background: cat?.color ?? "#FFFFFF" }}>
          <h2 className="text-xl font-black leading-snug">{topic.title}</h2>
          <p className="mb-3 mt-1 text-sm font-semibold text-[#3A3650]">
            {topic.players.toLocaleString()} people picked a side · {chats.length} chats
          </p>
          <div className="rounded-full bg-white">
            <PollBar topic={topic} onPick={(choice) => startPairing({ topic, choice, mode: "casual" })} />
          </div>
        </section>

        <ul className="space-y-3">
          {chats.map((c) => (
            <li key={c.id}>
              <Link href={`/convos/${c.id}`} className={`${card} ${press} flex items-center gap-3 p-3`}>
                <span className="flex shrink-0 -space-x-2">
                  <Avatar name={c.a} size={36} color="#8EA2FF" />
                  <Avatar name={c.b} size={36} color="#FFB27A" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-black">
                    <span className="truncate">{c.a} vs {c.b}</span>
                  </span>
                  <span className="block truncate text-sm text-[#5E5A72]">“{c.messages[0]?.text}”</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="flex items-center gap-1">
                    {c.mode === "comp" && c.status && <StatusChip status={c.status} />}
                    <ModeTag mode={c.mode} />
                  </span>
                  <span className="flex items-center gap-1 text-xs font-extrabold">
                    {c.mode === "comp" && c.scores && <span className="mr-1 tabular-nums">{c.scores.a}–{c.scores.b}</span>}
                    <Icon name="heart" className="h-3.5 w-3.5 text-[#D6336C]" /> {c.likes}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      {pairing && <PairingOverlay pairing={pairing} onCancel={cancelPairing} />}
    </>
  );
}
