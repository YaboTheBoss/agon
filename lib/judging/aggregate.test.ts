import assert from "node:assert/strict";
import test from "node:test";
import { aggregatePanel, validateBallot } from "./aggregate";
import { provisionalDebateFixtures } from "./fixtures";
import {
  JUDGING_SCHEMA_VERSION,
  type BallotConfidence,
  type BallotMargin,
  type BallotWinner,
  type JudgeBallot,
  type JudgeVariant,
  type PlayerRubric,
} from "./types";

const debate = provisionalDebateFixtures[0].debate;

function rubric(): PlayerRubric {
  const assessment = { rating: 3 as const, rationale: "Adequate for this fixture.", evidenceTurnIds: ["a-o"] };
  return {
    substantive_clash: { ...assessment },
    engagement: { ...assessment },
    comparative_weighing: { ...assessment },
    logical_factual_integrity: { ...assessment },
    clarity_communication: { ...assessment },
  };
}

function ballot(
  judgeId: string,
  variant: JudgeVariant,
  winner: BallotWinner,
  options: { margin?: BallotMargin; confidence?: BallotConfidence } = {}
): JudgeBallot {
  return {
    schemaVersion: JUDGING_SCHEMA_VERSION,
    debateId: debate.debateId,
    judgeId,
    model: "test-model",
    variant,
    winner,
    margin: options.margin ?? (winner === "tie" ? "none" : "clear"),
    confidence: options.confidence ?? "high",
    decisionSummary: "The ballot compares the central clash.",
    decisiveIssues: ["The central educational tradeoff."],
    majorClashes: [
      {
        issue: "Fairness versus collaboration",
        prevailed: winner,
        analysis: "The winning side better answered the central objection.",
        evidenceTurnIds: ["a-o", "b-e2"],
      },
    ],
    playerA: { rubric: rubric(), feedback: { strengths: ["Clear opening"], improvements: ["Engage the response"] } },
    playerB: { rubric: rubric(), feedback: { strengths: ["Direct engagement"], improvements: ["Be more concise"] } },
    unresolvedFactualDisputes: [],
    integrityConcerns: [],
  };
}

test("a valid unanimous initial panel does not escalate", () => {
  const result = aggregatePanel(
    [
      ballot("j1", "standard", "player_b"),
      ballot("j2", "bias_check", "player_b"),
      ballot("j3", "independent", "player_b"),
    ],
    debate
  );

  assert.equal(result.winner, "player_b");
  assert.equal(result.resultStrength, "clear");
  assert.equal(result.confidence, "high");
  assert.equal(result.requiresEscalation, false);
});

test("a split initial panel escalates", () => {
  const result = aggregatePanel(
    [
      ballot("j1", "standard", "player_b"),
      ballot("j2", "bias_check", "player_a", { margin: "narrow" }),
      ballot("j3", "independent", "player_b"),
    ],
    debate
  );

  assert.equal(result.winner, "player_b");
  assert.equal(result.requiresEscalation, true);
  assert.ok(result.escalationReasons.includes("The initial panel was not unanimous."));
  assert.ok(result.escalationReasons.includes("The verdict changed under the presentation-bias check."));
});

test("unknown transcript references invalidate a ballot", () => {
  const invalid = ballot("j1", "standard", "player_b");
  invalid.majorClashes[0].evidenceTurnIds = ["missing-turn"];
  const validation = validateBallot(invalid, debate);

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("missing-turn")));
});

test("a completed five-judge panel reports a narrow 3-2 result without another escalation", () => {
  const result = aggregatePanel(
    [
      ballot("j1", "standard", "player_b", { margin: "narrow" }),
      ballot("j2", "bias_check", "player_a", { margin: "narrow" }),
      ballot("j3", "independent", "player_b", { margin: "clear" }),
      ballot("j4", "escalation", "player_a", { margin: "narrow" }),
      ballot("j5", "escalation_bias_check", "player_b", { margin: "narrow" }),
    ],
    debate
  );

  assert.deepEqual(result.voteCounts, { player_a: 2, player_b: 3, tie: 0 });
  assert.equal(result.winner, "player_b");
  assert.equal(result.resultStrength, "narrow");
  assert.equal(result.requiresEscalation, false);
});
