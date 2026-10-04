import "server-only";

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { TAGGING_SYSTEM_INSTRUCTION, buildTaggingPrompt, taggingJsonSchema, type TagOption, type TopicForTagging } from "./prompt";
import { normalizeFeatures, type TopicFeatures } from "./validate";

export const TAGGING_MODEL = "gemini-3.8-flash";

/**
 * Cheapest thinking level first. The model rejects levels it doesn't support
 * (it refuses MINIMAL), so an unsupported level falls through to the next one;
 * MEDIUM is known to work (judging uses it with this model).
 */
const THINKING_LEVELS = [ThinkingLevel.LOW, ThinkingLevel.MEDIUM];

const isUnsupportedThinkingLevel = (error: unknown) => /thinking level/i.test(error instanceof Error ? error.message : String(error));

/** Ask Gemini for one topic's features, validated against the tag list. Throws on failure. */
export async function generateTopicFeatures(topic: TopicForTagging, tags: TagOption[]): Promise<TopicFeatures> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const client = new GoogleGenAI({ apiKey });

  for (const [i, thinkingLevel] of THINKING_LEVELS.entries()) {
    try {
      const response = await client.models.generateContent({
        model: TAGGING_MODEL,
        contents: buildTaggingPrompt(topic, tags),
        config: {
          systemInstruction: TAGGING_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseJsonSchema: taggingJsonSchema(tags.map((t) => t.slug)),
          // Labelling is easy: keep it as fast and cheap as the model allows.
          thinkingConfig: { thinkingLevel },
          temperature: 0,
          maxOutputTokens: 2048,
        },
      });
      if (!response.text) throw new Error("Gemini returned no tagging output.");
      return normalizeFeatures(JSON.parse(response.text), new Set(tags.map((t) => t.slug)));
    } catch (error) {
      if (i < THINKING_LEVELS.length - 1 && isUnsupportedThinkingLevel(error)) continue;
      throw error;
    }
  }
  throw new Error("No supported thinking level for tagging.");
}
