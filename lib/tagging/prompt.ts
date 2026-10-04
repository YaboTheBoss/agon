/**
 * Prompt + response schema for tagging one debate topic. The tag list comes
 * from the database (the `tag` table), so the model can only pick real tags.
 */

export type TopicForTagging = { title: string; sideA: string; sideB: string; category: string };
export type TagOption = { slug: string; name: string };

export const TAGGING_SYSTEM_INSTRUCTION = [
  "You label debate topics for Yaapi, an app where people pick a side on a question and argue it.",
  "Return only the requested JSON.",
  "tags: 1 to 4 slugs, chosen ONLY from the provided list, most relevant first. Never invent a slug.",
  'tone: "fun" for light, playful or silly debates (food takes, would-you-rather, pop-culture banter); "serious" for real-world issues with stakes (policy, ethics, money, careers).',
  "entities: 0 to 6 specific named things the topic is about: people, teams, leagues, companies, products, shows, films, albums, games, places, events.",
  "Use each entity's canonical full name as commonly written (\"Ariana Grande\" not \"Ari\"; \"Los Angeles Lakers\" not \"the Lakers\").",
  "Do not list generic concepts (\"music\", \"pizza\", \"college\") as entities: those are tags.",
  "weight: how central the entity is, from 0 to 1. The main subject is 1.0. If several share the spotlight, split it (three equal subjects: about 0.5 each). A passing mention is 0.2 to 0.4.",
].join("\n");

export function buildTaggingPrompt(topic: TopicForTagging, tags: TagOption[]) {
  return [
    `Debate question: ${topic.title}`,
    `Side A: ${topic.sideA}`,
    `Side B: ${topic.sideB}`,
    `Category: ${topic.category}`,
    "",
    "Allowed tags (slug: name):",
    ...tags.map((t) => `${t.slug}: ${t.name}`),
  ].join("\n");
}

export function taggingJsonSchema(tagSlugs: string[]) {
  return {
    type: "object",
    properties: {
      tags: { type: "array", items: { type: "string", enum: tagSlugs }, minItems: 1, maxItems: 4 },
      tone: { type: "string", enum: ["serious", "fun"] },
      entities: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            weight: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["name", "weight"],
        },
      },
    },
    required: ["tags", "tone", "entities"],
  };
}

/* ---------------- conversation summaries ---------------- */

export type ConvoForSummary = {
  topic: string;
  sideA: { name: string; label: string };
  sideB: { name: string; label: string };
  /** In order; each line "Name: text". */
  lines: string[];
};

/** Keep prompts bounded: long chats are cut to their opening and closing stretches. */
const MAX_TRANSCRIPT_CHARS = 12_000;

export const SUMMARY_SYSTEM_INSTRUCTION = [
  "You write the AI summary shown on a finished debate on Yaapi.",
  "Return only the requested JSON.",
  "summary: 2 or 3 sentences, under 350 characters, in plain present tense.",
  "Name both players and the main point each made; mention a concession, a turning point or common ground if there was one.",
  "Be neutral and fair: no winner, no judgement of who was right, no quotes longer than a few words.",
  "Write about what was said only. If the chat is mostly off-topic or very short, say so briefly.",
].join("\n");

export function buildSummaryPrompt(c: ConvoForSummary) {
  let transcript = c.lines.join("\n");
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    const half = MAX_TRANSCRIPT_CHARS / 2;
    transcript = `${transcript.slice(0, half)}\n[… middle of the conversation omitted …]\n${transcript.slice(-half)}`;
  }
  return [
    `Debate question: ${c.topic}`,
    `${c.sideA.name} argued: ${c.sideA.label}`,
    `${c.sideB.name} argued: ${c.sideB.label}`,
    "",
    "Transcript:",
    transcript,
  ].join("\n");
}

export const summaryJsonSchema = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
};
