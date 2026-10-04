/**
 * Turns whatever the model returned into features the database will accept
 * (set_topic_features refuses anything else): 1–4 tags from the app-wide list,
 * tone "serious" | "fun", at most 6 entities with names ≤ 60 chars and weights 0–1.
 * Pure, so it is unit-tested without calling Gemini.
 */

export type TopicFeatures = {
  tags: string[];
  tone: "serious" | "fun";
  entities: { name: string; weight: number }[];
};

export class InvalidTaggingError extends Error {}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function normalizeFeatures(raw: unknown, allowedTags: ReadonlySet<string>): TopicFeatures {
  if (!raw || typeof raw !== "object") throw new InvalidTaggingError("Model output is not an object");
  const r = raw as Record<string, unknown>;

  const tags = [...new Set((Array.isArray(r.tags) ? r.tags : []).filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase()))]
    .filter((t) => allowedTags.has(t))
    .slice(0, 4);
  if (tags.length === 0) throw new InvalidTaggingError("No usable tags in model output");

  const tone = r.tone === "fun" ? "fun" : "serious";

  const seen = new Set<string>();
  const entities = (Array.isArray(r.entities) ? r.entities : [])
    .flatMap((e) => {
      if (!e || typeof e !== "object") return [];
      const { name, weight } = e as Record<string, unknown>;
      if (typeof name !== "string") return [];
      const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) return [];
      seen.add(key);
      const w = typeof weight === "number" && Number.isFinite(weight) ? clamp01(weight) : 0.5;
      return w > 0 ? [{ name: clean, weight: Math.round(w * 100) / 100 }] : [];
    })
    .sort((x, y) => y.weight - x.weight)
    .slice(0, 6);

  return { tags, tone, entities };
}

/** The summary text the database will accept (1–600 chars), tidied. */
export function normalizeSummary(raw: unknown): string {
  const text = raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).summary === "string" ? ((raw as Record<string, unknown>).summary as string) : "";
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) throw new InvalidTaggingError("No summary in model output");
  if (clean.length <= 600) return clean;
  const cut = clean.slice(0, 600);
  const lastStop = cut.lastIndexOf(". ");
  return lastStop > 200 ? cut.slice(0, lastStop + 1) : `${cut.slice(0, 597)}…`;
}
