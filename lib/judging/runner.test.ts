import assert from "node:assert/strict";
import test from "node:test";
import { provisionalDebateFixtures } from "./fixtures";
import { runJudgingPipeline, type BallotRequest, type JudgingDependencies } from "./runner";
import { JUDGING_SCHEMA_VERSION, type JudgeBallot, type JudgingSynthesis, type PlayerRubric } from "./types";

const debate = provisionalDebateFixtures[0].debate;

function rubric(): PlayerRubric {
  const value = { rating: 3 as const, rationale: "Supported assessment.", evidenceTurnIds: ["a-o"] };
  return {
    substantive_clash: { ...value }, engagement: { ...value }, comparative_weighing: { ...value },
    logical_factual_integrity: { ...value }, clarity_communication: { ...value },
  };
}

function makeBallot(request: BallotRequest, winner: "player_a" | "player_b" | "tie"): JudgeBallot {
  return {
    schemaVersion: JUDGING_SCHEMA_VERSION, debateId: debate.debateId, judgeId: request.judgeId,
    model: request.model, variant: request.variant, winner, margin: winner === "tie" ? "none" : "narrow",
    confidence: "high", decisionSummary: "A comparative decision.", decisiveIssues: ["Core clash"],
    majorClashes: [{ issue: "Core clash", prevailed: winner, analysis: "Compared both positions.", evidenceTurnIds: ["a-o", "b-o"] }],
    playerA: { rubric: rubric(), feedback: { strengths: ["Clear"], improvements: ["Weigh more"] } },
    playerB: { rubric: rubric(), feedback: { strengths: ["Responsive"], improvements: ["Be precise"] } },
    unresolvedFactualDisputes: [], integrityConcerns: [],
  };
}

function synthesis(winner: "player_a" | "player_b" | "tie", resultStrength: "none" | "narrow" | "clear" | "decisive"): JudgingSynthesis {
  return {
    winner, resultStrength, headline: "Result", explanation: "Panel explanation.",
    playerA: { strengths: ["Clear"], improvements: ["Weigh more"] },
    playerB: { strengths: ["Responsive"], improvements: ["Be precise"] },
    consensus: ["Core clash mattered"], disagreements: [], unresolvedFacts: [],
  };
}

test("a unanimous flash panel skips Pro escalation", async () => {
  const calls: BallotRequest[] = [];
  const dependencies: JudgingDependencies = {
    async generateBallot(request) { calls.push(request); return { value: makeBallot(request, "player_b") }; },
    async generateSynthesis({ panel }) { return { value: synthesis(panel.winner, panel.resultStrength) }; },
  };
  const result = await runJudgingPipeline(debate, dependencies);
  assert.equal(result.escalated, false);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.model === "gemini-3.8-flash"));
});

test("a split panel adds two Pro ballots", async () => {
  let initialIndex = 0;
  const calls: BallotRequest[] = [];
  const dependencies: JudgingDependencies = {
    async generateBallot(request) {
      calls.push(request);
      const winner = request.model === "gemini-3.8-flash" && initialIndex++ === 1 ? "player_a" : "player_b";
      return { value: makeBallot(request, winner) };
    },
    async generateSynthesis({ panel }) { return { value: synthesis(panel.winner, panel.resultStrength) }; },
  };
  const result = await runJudgingPipeline(debate, dependencies);
  assert.equal(result.escalated, true);
  assert.equal(calls.length, 5);
  assert.equal(calls.filter((call) => call.model === "gemini-3.1-pro-preview").length, 2);
  assert.deepEqual(result.panel.voteCounts, { player_a: 1, player_b: 4, tie: 0 });
});
