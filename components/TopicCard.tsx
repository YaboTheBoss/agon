"use client";

/**
 * A topic in a list: category, title, the pick-a-side poll and how many people
 * are on it. Tapping the card opens the topic (its chats); the category chip
 * and the poll are separate controls layered above that link.
 */

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Choice, Topic } from "@/lib/data";
import { useStore } from "@/lib/store";
import { Icon, PollBar, card } from "@/components/ui";

/** How long a card must be at least half on screen to count as seen. */
const SEEN_AFTER_MS = 1_000;

export function TopicCard({
  topic,
  onPick,
  trackImpression = false,
}: {
  topic: Topic;
  onPick: (t: Topic, choice: Choice) => void;
  /** Report "this card was seen" for the recommender (the feed does; search doesn't). */
  trackImpression?: boolean;
}) {
  const { categoryBySlug, convosForTopic, myVotes, actions } = useStore();
  const ref = useRef<HTMLLIElement>(null);
  const { reportImpression } = actions;

  useEffect(() => {
    const el = ref.current;
    if (!trackImpression || !el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            reportImpression(topic.id);
            observer.disconnect();
          }, SEEN_AFTER_MS);
        } else if (timer) {
          clearTimeout(timer);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [trackImpression, topic.id, reportImpression]);
  const cat = categoryBySlug(topic.category);
  const chats = convosForTopic(topic.id).length;
  const picked = (myVotes.get(topic.id) as Choice | undefined) ?? null;

  return (
    <li ref={ref} className={`${card} relative p-4 transition-colors hover:bg-[#FFFDF5]`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {cat && (
          <Link
            href={`/categories/${cat.slug}`}
            className="relative z-10 rounded-full border-2 border-[#1E1B2E] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
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

      <h2 className="mb-3 text-lg font-black leading-snug text-[#1E1B2E]">
        {/* Stretched link: its ::after covers the whole card. */}
        <Link
          href={`/topics/${topic.id}`}
          className="after:absolute after:inset-0 after:rounded-[22px] focus-visible:outline-none focus-visible:after:ring-4 focus-visible:after:ring-[#FFD43B]"
        >
          {topic.title}
        </Link>
      </h2>

      <div className="relative z-10">
        <PollBar topic={topic} onPick={(c) => onPick(topic, c)} picked={picked} showPct={topic.players > 0} />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs font-semibold text-[#5E5A72]">
        <span className="flex items-center gap-1">
          <Icon name="users" className="h-3.5 w-3.5" /> {topic.players.toLocaleString()} picked a side
        </span>
        <span className="flex items-center gap-1 font-extrabold text-[#1E1B2E]" aria-hidden="true">
          {chats > 0 ? `${chats} chat${chats > 1 ? "s" : ""}` : "No chats yet"} <Icon name="arrow" className="h-3.5 w-3.5" />
        </span>
      </div>
    </li>
  );
}
