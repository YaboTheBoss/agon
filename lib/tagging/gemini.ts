import "server-only";

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  SUMMARY_SYSTEM_INSTRUCTION,
  TAGGING_SYSTEM_INSTRUCTION,
  buildSummaryPrompt,
  buildTaggingPrompt,
  summaryJsonSchema,
  taggingJsonSchema,
  type ConvoForSummary,
  type TagOption,
  type TopicForTagging,
} from "./prompt";
import { normalizeFeatures, normalizeSummary, type TopicFeatures } from "./validate";

export const TAGGING_MODEL = "gemini-3.8-flash";

/**
 * Cheapest thinking level first. The model rejects levels it doesn't support
 * (it refuses MINIMAL), so an unsupported level falls through to the next one;
 * MEDIUM is known to work (judging uses it with this model).
 */
const THINKING_LEVELS = [ThinkingLevel.LOW, ThinkingLevel.MEDIUM];

const isUnsupportedThinkingLevel = (error: unknown) => /thinking level/i.test(error instanceof Error ? error.message : String(error));

/** One structured-JSON call to Gemini, parsed. Throws on failure. */
async function generateJson(contents: string, systemInstruction: string, responseJsonSchema: object): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const client = new GoogleGenAI({ apiKey });

  for (const [i, thinkingLevel] of THINKING_LEVELS.entries()) {
    try {
      const response = await client.models.generateContent({
        model: TAGGING_MODEL,
        contents,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema,
          // Labelling and short summaries are easy: keep them as fast and cheap as the model allows.
          thinkingConfig: { thinkingLevel },
          temperature: 0,
          maxOutputTokens: 2048,
        },
      });
      if (!response.text) throw new Error("Gemini returned no output.");
      return JSON.parse(response.text);
    } catch (error) {
      if (i < THINKING_LEVELS.length - 1 && isUnsupportedThinkingLevel(error)) continue;
      throw error;
    }
  }
  throw new Error("No supported thinking level.");
}

/** Ask Gemini for one topic's features, validated against the tag list. Throws on failure. */
export async function generateTopicFeatures(topic: TopicForTagging, tags: TagOption[]): Promise<TopicFeatures> {
  const raw = await generateJson(buildTaggingPrompt(topic, tags), TAGGING_SYSTEM_INSTRUCTION, taggingJsonSchema(tags.map((t) => t.slug)));
  return normalizeFeatures(raw, new Set(tags.map((t) => t.slug)));
}

/** Ask Gemini for a finished conversation's summary. Throws on failure. */
export async function generateConvoSummary(convo: ConvoForSummary): Promise<string> {
  return normalizeSummary(await generateJson(buildSummaryPrompt(convo), SUMMARY_SYSTEM_INSTRUCTION, summaryJsonSchema));
}
