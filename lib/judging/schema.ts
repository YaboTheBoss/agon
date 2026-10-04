import { JUDGING_SCHEMA_VERSION } from "./types";

const evidenceIds = {
  type: "array",
  items: { type: "string" },
  description: "Stable IDs of transcript turns that directly support this finding.",
} as const;

const dimensionAssessment = {
  type: "object",
  additionalProperties: false,
  required: ["rating", "rationale", "evidenceTurnIds"],
  properties: {
    rating: { type: "integer", minimum: 1, maximum: 5 },
    rationale: { type: "string" },
    evidenceTurnIds: evidenceIds,
  },
} as const;

const rubricProperties = {
  substantive_clash: dimensionAssessment,
  engagement: dimensionAssessment,
  comparative_weighing: dimensionAssessment,
  logical_factual_integrity: dimensionAssessment,
  clarity_communication: dimensionAssessment,
} as const;

const playerAssessment = {
  type: "object",
  additionalProperties: false,
  required: ["rubric", "feedback"],
  properties: {
    rubric: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(rubricProperties),
      properties: rubricProperties,
    },
    feedback: {
      type: "object",
      additionalProperties: false,
      required: ["strengths", "improvements"],
      properties: {
        strengths: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

/**
 * JSON Schema passed to Gemini structured output. Semantic checks that JSON
 * Schema cannot express live in validateBallot.
 */
export const judgeBallotJsonSchema = {
  title: "Yaapi judge ballot",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "debateId",
    "judgeId",
    "model",
    "variant",
    "winner",
    "margin",
    "confidence",
    "decisionSummary",
    "decisiveIssues",
    "majorClashes",
    "playerA",
    "playerB",
    "unresolvedFactualDisputes",
    "integrityConcerns",
  ],
  properties: {
    schemaVersion: { type: "string", enum: [JUDGING_SCHEMA_VERSION] },
    debateId: { type: "string" },
    judgeId: { type: "string" },
    model: { type: "string" },
    variant: {
      type: "string",
      enum: ["standard", "bias_check", "independent", "escalation", "escalation_bias_check"],
    },
    winner: { type: "string", enum: ["player_a", "player_b", "tie"] },
    margin: { type: "string", enum: ["none", "narrow", "clear", "decisive"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    decisionSummary: { type: "string" },
    decisiveIssues: { type: "array", items: { type: "string" } },
    majorClashes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["issue", "prevailed", "analysis", "evidenceTurnIds"],
        properties: {
          issue: { type: "string" },
          prevailed: { type: "string", enum: ["player_a", "player_b", "tie"] },
          analysis: { type: "string" },
          evidenceTurnIds: evidenceIds,
        },
      },
    },
    playerA: playerAssessment,
    playerB: playerAssessment,
    unresolvedFactualDisputes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "status", "treatment", "couldAffectOutcome", "evidenceTurnIds"],
        properties: {
          claim: { type: "string" },
          status: { type: "string", enum: ["unresolved", "partially_resolved"] },
          treatment: { type: "string" },
          couldAffectOutcome: { type: "boolean" },
          evidenceTurnIds: evidenceIds,
        },
      },
    },
    integrityConcerns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["player", "kind", "description", "severity", "evidenceTurnIds"],
        properties: {
          player: { type: "string", enum: ["player_a", "player_b"] },
          kind: {
            type: "string",
            enum: ["contradiction", "fallacy", "fabrication", "misrepresentation", "personal_attack", "other"],
          },
          description: { type: "string" },
          severity: { type: "string", enum: ["minor", "material", "severe"] },
          evidenceTurnIds: evidenceIds,
        },
      },
    },
  },
} as const;

export const judgingSynthesisJsonSchema = {
  title: "Yaapi judging synthesis",
  type: "object",
  additionalProperties: false,
  required: [
    "winner",
    "resultStrength",
    "headline",
    "explanation",
    "playerA",
    "playerB",
    "consensus",
    "disagreements",
    "unresolvedFacts",
  ],
  properties: {
    winner: { type: "string", enum: ["player_a", "player_b", "tie"] },
    resultStrength: { type: "string", enum: ["none", "narrow", "clear", "decisive"] },
    headline: { type: "string" },
    explanation: { type: "string" },
    playerA: {
      type: "object",
      additionalProperties: false,
      required: ["strengths", "improvements"],
      properties: {
        strengths: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
      },
    },
    playerB: {
      type: "object",
      additionalProperties: false,
      required: ["strengths", "improvements"],
      properties: {
        strengths: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
      },
    },
    consensus: { type: "array", items: { type: "string" } },
    disagreements: { type: "array", items: { type: "string" } },
    unresolvedFacts: { type: "array", items: { type: "string" } },
  },
} as const;
