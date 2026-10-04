import {
  JUDGING_SCHEMA_VERSION,
  type BallotConfidence,
  type BallotMargin,
  type BallotValidation,
  type BallotWinner,
  type DebateForJudging,
  type JudgeBallot,
  type PanelResult,
  type VoteCounts,
} from "./types";

const RUBRIC_KEYS = [
  "substantive_clash",
  "engagement",
  "comparative_weighing",
  "logical_factual_integrity",
  "clarity_communication",
] as const;

const MARGIN_ORDER: BallotMargin[] = ["none", "narrow", "clear", "decisive"];
const CONFIDENCE_ORDER: BallotConfidence[] = ["low", "medium", "high"];

export function validateBallot(ballot: JudgeBallot, debate: DebateForJudging): BallotValidation {
  const errors: string[] = [];
  const turnIds = new Set(debate.turns.map((turn) => turn.id));

  if (ballot.schemaVersion !== JUDGING_SCHEMA_VERSION) errors.push("Unsupported schemaVersion.");
  if (ballot.debateId !== debate.debateId) errors.push("Ballot debateId does not match the debate.");
  if (!ballot.judgeId.trim()) errors.push("judgeId is required.");
  if (!ballot.model.trim()) errors.push("model is required.");
  if (!ballot.decisionSummary.trim()) errors.push("decisionSummary is required.");
  if (ballot.decisiveIssues.length === 0) errors.push("At least one decisive issue is required.");
  if (ballot.majorClashes.length === 0) errors.push("At least one major clash is required.");

  if (ballot.winner === "tie" && ballot.margin !== "none") {
    errors.push("A tie ballot must use margin 'none'.");
  }
  if (ballot.winner !== "tie" && ballot.margin === "none") {
    errors.push("A winning ballot must use narrow, clear, or decisive margin.");
  }

  for (const [playerName, player] of [
    ["playerA", ballot.playerA],
    ["playerB", ballot.playerB],
  ] as const) {
    for (const key of RUBRIC_KEYS) {
      const assessment = player.rubric[key];
      if (!Number.isInteger(assessment.rating) || assessment.rating < 1 || assessment.rating > 5) {
        errors.push(`${playerName}.${key}.rating must be an integer from 1 to 5.`);
      }
      if (!assessment.rationale.trim()) errors.push(`${playerName}.${key}.rationale is required.`);
      validateEvidenceIds(assessment.evidenceTurnIds, `${playerName}.${key}`, turnIds, errors);
    }
  }

  ballot.majorClashes.forEach((clash, index) => {
    if (!clash.issue.trim() || !clash.analysis.trim()) errors.push(`majorClashes[${index}] is incomplete.`);
    validateEvidenceIds(clash.evidenceTurnIds, `majorClashes[${index}]`, turnIds, errors);
  });

  ballot.unresolvedFactualDisputes.forEach((dispute, index) => {
    validateEvidenceIds(dispute.evidenceTurnIds, `unresolvedFactualDisputes[${index}]`, turnIds, errors);
  });

  ballot.integrityConcerns.forEach((concern, index) => {
    validateEvidenceIds(concern.evidenceTurnIds, `integrityConcerns[${index}]`, turnIds, errors);
  });

  return { valid: errors.length === 0, errors };
}

function validateEvidenceIds(ids: string[], path: string, known: Set<string>, errors: string[]) {
  for (const id of ids) {
    if (!known.has(id)) errors.push(`${path} references unknown turn '${id}'.`);
  }
}

export function aggregatePanel(
  ballots: JudgeBallot[],
  debate: DebateForJudging,
  expectedBallots = ballots.length
): PanelResult {
  const validated = ballots.map((ballot) => ({ ballot, validation: validateBallot(ballot, debate) }));
  const valid = validated.filter((item) => item.validation.valid).map((item) => item.ballot);
  const invalidBallots = Math.max(expectedBallots - valid.length, ballots.length - valid.length);

  const voteCounts: VoteCounts = { player_a: 0, player_b: 0, tie: 0 };
  valid.forEach((ballot) => voteCounts[ballot.winner]++);

  const majority = Math.floor(valid.length / 2) + 1;
  let winner: BallotWinner = "tie";
  if (voteCounts.player_a >= majority) winner = "player_a";
  else if (voteCounts.player_b >= majority) winner = "player_b";

  const winnerBallots = valid.filter((ballot) => ballot.winner === winner);
  const resultStrength = winner === "tie" ? "none" : medianMargin(winnerBallots.map((ballot) => ballot.margin));
  const confidence = panelConfidence(valid, winner, invalidBallots);
  const escalationReasons = escalationReasonsFor(valid, invalidBallots);

  return {
    winner,
    voteCounts,
    validBallots: valid.length,
    invalidBallots,
    resultStrength,
    confidence,
    requiresEscalation: ballots.length <= 3 && escalationReasons.length > 0,
    escalationReasons,
  };
}

function escalationReasonsFor(ballots: JudgeBallot[], invalidBallots: number): string[] {
  const reasons: string[] = [];
  if (ballots.length === 0) reasons.push("No valid ballots were returned.");
  if (invalidBallots > 0) reasons.push("At least one ballot failed validation.");

  const firstWinner = ballots[0]?.winner;
  if (firstWinner && ballots.some((ballot) => ballot.winner !== firstWinner)) {
    reasons.push("The initial panel was not unanimous.");
  }
  if (ballots.some((ballot) => ballot.confidence === "low")) {
    reasons.push("At least one judge reported low confidence.");
  }
  if (ballots.some((ballot) => ballot.unresolvedFactualDisputes.some((dispute) => dispute.couldAffectOutcome))) {
    reasons.push("An unresolved factual dispute could affect the outcome.");
  }

  const standard = ballots.find((ballot) => ballot.variant === "standard");
  const biasCheck = ballots.find((ballot) => ballot.variant === "bias_check");
  if (standard && biasCheck && standard.winner !== biasCheck.winner) {
    reasons.push("The verdict changed under the presentation-bias check.");
  }

  return [...new Set(reasons)];
}

function medianMargin(margins: BallotMargin[]): BallotMargin {
  if (margins.length === 0) return "none";
  const sorted = [...margins].sort((a, b) => MARGIN_ORDER.indexOf(a) - MARGIN_ORDER.indexOf(b));
  return sorted[Math.floor(sorted.length / 2)];
}

function panelConfidence(ballots: JudgeBallot[], winner: BallotWinner, invalidBallots: number): BallotConfidence {
  if (ballots.length === 0 || invalidBallots > 0) return "low";
  const agreement = ballots.filter((ballot) => ballot.winner === winner).length / ballots.length;
  const medianSelfConfidence = medianConfidence(ballots.map((ballot) => ballot.confidence));

  if (agreement === 1 && medianSelfConfidence === "high") return "high";
  if (agreement >= 0.6 && medianSelfConfidence !== "low") return "medium";
  return "low";
}

function medianConfidence(confidences: BallotConfidence[]): BallotConfidence {
  const sorted = [...confidences].sort(
    (a, b) => CONFIDENCE_ORDER.indexOf(a) - CONFIDENCE_ORDER.indexOf(b)
  );
  return sorted[Math.floor(sorted.length / 2)] ?? "low";
}
