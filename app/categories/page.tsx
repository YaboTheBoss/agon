"use client";

import Link from "next/link";
import { CATEGORIES, topicsForCategory } from "@/lib/data";
import { Icon, PageHeader, press } from "@/components/ui";

export default function CategoriesPage() {
  return (
    <>
      <PageHeader title="Categories" sub="Find your kind of argument" />
      <main className="mx-auto max-w-2xl px-4 pt-5">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {CATEGORIES.map((c, i) => (
            <li key={c.slug}>
              <Link
                href={`/categories/${c.slug}`}
                className={`flex aspect-[1/1.05] flex-col justify-between rounded-[22px] border-2 border-[#1E1B2E] p-4 shadow-[4px_4px_0_#1E1B2E] ${press} ${
                  i % 2 ? "rotate-[0.6deg]" : "-rotate-[0.6deg]"
                }`}
                style={{ background: c.color }}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-[#1E1B2E] bg-white">
                  <Icon name={c.icon} className="h-6 w-6" />
                </span>
                <span>
                  <span className="block font-[family-name:var(--font-display)] text-2xl leading-none">{c.name}</span>
                  <span className="mt-1 block text-xs font-bold text-[#1E1B2E]/75">{topicsForCategory(c.slug).length} topics</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
