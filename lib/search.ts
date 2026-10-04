/**
 * Client-side topic search (topics are fully loaded in the store, so no server
 * round-trip). Matches topic titles only: every word of the query must appear
 * in the title, case-insensitive. Most-played first.
 */

import type { Topic } from "@/lib/data";

export function searchTopics(query: string, topics: Topic[]): Topic[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return topics
    .filter((t) => {
      const title = t.title.toLowerCase();
      return terms.every((w) => title.includes(w));
    })
    .sort((x, y) => y.players - x.players);
}
