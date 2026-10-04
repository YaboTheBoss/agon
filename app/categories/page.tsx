"use client";

import Link from "next/link";
import { topicsForCategory } from "@/lib/data";
import { useStore } from "@/lib/store";
import { Icon, Loading, PageHeader, press } from "@/components/ui";
import { SearchBox } from "@/components/SearchBox";
import ModeSwitch from "@/components/ModeSwitch";
import { usePlayMode } from "@/lib/play-mode";

export default function CategoriesPage() {
  const { ready, categories, topics } = useStore();
  const { mode } = usePlayMode();
  return (
    <div className="feed-theme" data-mode={mode}>
      <PageHeader className="feed-header" title="Categories" sub="Find your kind of argument" right={<ModeSwitch />}>
        <SearchBox />
      </PageHeader>
      <main className="mx-auto max-w-2xl px-4 pt-5">
        {!ready && <Loading />}
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {categories.map((c, i) => (
            <li key={c.slug}>
              <Link
                href={`/categories/${c.slug}`}
                className={`category-tile flex aspect-[1/1.05] flex-col justify-between rounded-[22px] border-2 border-[#1E1B2E] p-4 shadow-[4px_4px_0_#1E1B2E] ${press} ${
                  i % 2 ? "rotate-[0.6deg]" : "-rotate-[0.6deg]"
                }`}
                style={{ background: mode === "comp" ? `color-mix(in srgb, ${c.color} 82%, #342841)` : c.color }}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-[#1E1B2E] bg-white text-[#1E1B2E]">
                  <Icon name={c.icon} className="h-6 w-6" />
                </span>
                <span>
                  <span className="block font-[family-name:var(--font-display)] text-2xl leading-none">{c.name}</span>
                  <span className="topic-meta mt-1 block text-xs font-bold text-[#1E1B2E]/75">{topicsForCategory(topics, c.slug).length} topics</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
