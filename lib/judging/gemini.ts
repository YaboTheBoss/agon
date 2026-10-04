import "server-only";

import { GoogleGenAI, ThinkingLevel, type GenerateContentResponse } from "@google/genai";
import { buildJudgePrompt, buildJudgeSystemInstruction, buildSynthesisPrompt } from "./prompt";
import { judgeBallotJsonSchema, judgingSynthesisJsonSchema } from "./schema";
import type { BallotRequest, Generated, JudgingDependencies, SynthesisRequest } from "./runner";
import { JUDGING_SCHEMA_VERSION, type JudgeBallot, type JudgeCallUsage, type JudgingSynthesis } from "./types";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  return new GoogleGenAI({ apiKey });
}

function usageFor(
  response: GenerateContentResponse,
  metadata: Pick<JudgeCallUsage, "judgeId" | "model" | "variant">
): JudgeCallUsage {
  return {
    ...metadata,
    promptTokens: response.usageMetadata?.promptTokenCount,
    outputTokens: response.usageMetadata?.candidatesTokenCount,
    totalTokens: response.usageMetadata?.totalTokenCount,
  };
}

async function generateBallot(request: BallotRequest): Promise<Generated<JudgeBallot>> {
  const response = await getClient().models.generateContent({
    model: request.model,
    contents: buildJudgePrompt(request.debate, request),
    config: {
      systemInstruction: buildJudgeSystemInstruction(request.variant),
      responseMimeType: "application/json",
      responseJsonSchema: judgeBallotJsonSchema,
      thinkingConfig: {
        thinkingLevel: request.thinkingLevel === "high" ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM,
      },
      temperature: 0.2,
      maxOutputTokens: 8192,
    },
  });

  if (!response.text) throw new Error("Gemini returned an empty ballot.");
  const parsed = JSON.parse(response.text) as JudgeBallot;
  // Identity fields are server-owned even though Gemini emits them for the schema.
  const value: JudgeBallot = {
    ...parsed,
    schemaVersion: JUDGING_SCHEMA_VERSION,
    debateId: request.debate.debateId,
    judgeId: request.judgeId,
    model: request.model,
    variant: request.variant,
  };
  return {
    value,
    usage: usageFor(response, {
      judgeId: request.judgeId,
      model: request.model,
      variant: request.variant,
    }),
  };
}

async function generateSynthesis(request: SynthesisRequest): Promise<Generated<JudgingSynthesis>> {
  const model = "gemini-3.8-flash";
  const response = await getClient().models.generateContent({
    model,
    contents: buildSynthesisPrompt(request.debate, request.panel, request.ballots),
    config: {
      systemInstruction: "You write balanced, specific post-debate feedback for Yaapi. The supplied panel result is immutable. Return only the requested structured JSON.",
      responseMimeType: "application/json",
      responseJsonSchema: judgingSynthesisJsonSchema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  });

  if (!response.text) throw new Error("Gemini returned an empty synthesis.");
  return {
    value: JSON.parse(response.text) as JudgingSynthesis,
    usage: usageFor(response, { judgeId: "panel-synthesis", model, variant: "synthesis" }),
  };
}

export const geminiJudgingDependencies: JudgingDependencies = {
  generateBallot,
  generateSynthesis,
};
