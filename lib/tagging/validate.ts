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

export type BatchAward = { messageId: string; points: number; reason: string };

/**
 * Model output → awards the database will accept: only messages in the batch,
 * one award per message, whole points 0–5, a short reason. The server
 * re-applies the per-side batch cap, so this is a first line of defence.
 */
export function normalizeAwards(raw: unknown, batchIds: ReadonlySet<string>): BatchAward[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).awards) ? ((raw as Record<string, unknown>).awards as unknown[]) : null;
  if (!list) throw new InvalidTaggingError("No awards in model output");
  const seen = new Set<string>();
  return list.flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const { messageId, points, reason } = a as Record<string, unknown>;
    const id = String(messageId ?? "");
    if (!batchIds.has(id) || seen.has(id)) return [];
    seen.add(id);
    const p = typeof points === "number" && Number.isFinite(points) ? Math.min(5, Math.max(0, Math.round(points))) : 0;
    const r = typeof reason === "string" ? reason.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    return p > 0 ? [{ messageId: id, points: p, reason: r || "Constructive point" }] : [];
  });
}

export type Feedback = { summary: string; feedbackA: string; feedbackB: string };

export function normalizeFeedback(raw: unknown): Feedback {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/[ \t]+/g, " ").slice(0, max) : "");
  const out = { summary: text(r.summary, 600), feedbackA: text(r.feedbackA, 1200), feedbackB: text(r.feedbackB, 1200) };
  if (!out.summary || !out.feedbackA || !out.feedbackB) throw new InvalidTaggingError("Incomplete feedback in model output");
  return out;
}
