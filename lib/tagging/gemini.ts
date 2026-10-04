import "server-only";

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { TAGGING_SYSTEM_INSTRUCTION, buildTaggingPrompt, taggingJsonSchema, type TagOption, type TopicForTagging } from "./prompt";
import { normalizeFeatures, type TopicFeatures } from "./validate";

export const TAGGING_MODEL = "gemini-3.8-flash";

/** Ask Gemini for one topic's features, validated against the tag list. Throws on failure. */
export async function generateTopicFeatures(topic: TopicForTagging, tags: TagOption[]): Promise<TopicFeatures> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const response = await new GoogleGenAI({ apiKey }).models.generateContent({
    model: TAGGING_MODEL,
    contents: buildTaggingPrompt(topic, tags),
    config: {
      systemInstruction: TAGGING_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema: taggingJsonSchema(tags.map((t) => t.slug)),
      // Labelling is easy: keep it fast and cheap.
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      temperature: 0,
      maxOutputTokens: 1024,
    },
  });

  if (!response.text) throw new Error("Gemini returned no tagging output.");
  return normalizeFeatures(JSON.parse(response.text), new Set(tags.map((t) => t.slug)));
}
