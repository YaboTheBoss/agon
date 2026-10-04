"use client";

/**
 * Topic search results — /search?q=… . Matches topic titles, filters live as
 * you type; submitting updates the URL so results can be shared.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { usePageState } from "@/lib/page-memory";
import { searchTopics } from "@/lib/search";
import { useStore } from "@/lib/store";
import { Loading, PageHeader, PairingOverlay, displayFont, usePairing } from "@/components/ui";
import { SearchBox } from "@/components/SearchBox";
import { TopicCard } from "@/components/TopicCard";
import { usePlayMode } from "@/lib/play-mode";

export default function SearchPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <Search />
    </Suspense>
  );
}

function Search() {
  const { mode } = usePlayMode();
  const router = useRouter();
  const initial = useSearchParams().get("q") ?? "";
  const [q, setQ] = usePageState(`search:query:${initial}`, initial);
  const { ready, topics } = useStore();
  const { pairing, startPairing, cancelPairing } = usePairing();

  const results = searchTopics(q, topics);
  const query = q.trim();

  return (
    <>
      <PageHeader title="Search" back="/categories">
        <SearchBox
          value={q}
          initial={initial}
          autoFocus={!initial}
          onChange={setQ}
          onSubmit={(next) => router.replace(next ? `/search?q=${encodeURIComponent(next)}` : "/search")}
        />
      </PageHeader>

      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-5">
        {!ready ? (
          <Loading />
        ) : !query ? (
          <p className="text-center text-sm font-semibold text-[#5E5A72]">Search topic titles, like “pizza” or “college athletes”.</p>
        ) : (
          <section aria-labelledby="topic-results">
            <h2 id="topic-results" className={`${displayFont} mb-2 text-lg`}>
              {results.length} {results.length === 1 ? "topic" : "topics"}
            </h2>
            {results.length > 0 ? (
              <ul className="space-y-4">
                {results.map((t) => (
                  <TopicCard key={t.id} topic={t} onPick={(topic, choice) => startPairing({ topic, choice, mode })} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border-2 border-dashed border-[#1E1B2E] bg-white px-4 py-5 text-center text-sm font-semibold text-[#3A3650]">
                No topics match “{query}”.
                <Link href="/" className="mt-1 block font-extrabold text-[#1E1B2E] underline decoration-2 underline-offset-2">
                  Start a debate about it from the feed
                </Link>
              </p>
            )}
          </section>
        )}
      </main>

      {pairing && <PairingOverlay pairing={pairing} onCancel={cancelPairing} />}
    </>
  );
}
