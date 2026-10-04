"use client";

/**
 * Topic search field. Submitting opens /search?q=… (or, on the search page
 * itself, `onSubmit` keeps the URL in sync). `onChange` lets a page filter live.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui";

export function SearchBox({
  initial = "",
  autoFocus = false,
  onChange,
  onSubmit,
}: {
  initial?: string;
  autoFocus?: boolean;
  onChange?: (q: string) => void;
  onSubmit?: (q: string) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (onSubmit) onSubmit(query);
    else if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <form role="search" onSubmit={submit} className="relative">
      <label htmlFor="topic-search" className="sr-only">
        Search topics
      </label>
      <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5E5A72]" />
      <input
        id="topic-search"
        type="search"
        value={q}
        autoFocus={autoFocus}
        enterKeyHint="search"
        maxLength={80}
        placeholder="Search topics…"
        onChange={(e) => {
          setQ(e.target.value);
          onChange?.(e.target.value);
        }}
        className="block min-h-[46px] w-full rounded-full border-2 border-[#1E1B2E] bg-white pl-10 pr-4 text-[15px] font-semibold shadow-[2px_2px_0_#1E1B2E] placeholder:font-normal placeholder:text-[#8A86A0] focus:outline-none focus:ring-4 focus:ring-[#FFD43B]"
      />
    </form>
  );
}
