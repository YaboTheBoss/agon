export const JUDGING_SCHEMA_VERSION = "1.0.0" as const;

export type PlayerLabel = "player_a" | "player_b";
export type BallotWinner = PlayerLabel | "tie";
export type BallotMargin = "none" | "narrow" | "clear" | "decisive";
export type BallotConfidence = "low" | "medium" | "high";
export type DebatePhase = "opening" | "engagement" | "closing";
export type JudgeVariant = "standard" | "bias_check" | "independent" | "escalation" | "escalation_bias_check";

export type RubricDimension =
  | "substantive_clash"
  | "engagement"
  | "comparative_weighing"
  | "logical_factual_integrity"
  | "clarity_communication";

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface DebateTurn {
  id: string;
  phase: DebatePhase;
  speaker: PlayerLabel;
  text: string;
}

export interface DebateForJudging {
  debateId: string;
  topic: string;
  positionA: string;
  positionB: string;
  contextCard?: string;
  turns: DebateTurn[];
}

export interface DimensionAssessment {
  rating: Rating;
  rationale: string;
  evidenceTurnIds: string[];
}

export type PlayerRubric = Record<RubricDimension, DimensionAssessment>;

export interface PlayerFeedback {
  strengths: string[];
  improvements: string[];
}

export interface ClashAssessment {
  issue: string;
  prevailed: BallotWinner;
  analysis: string;
  evidenceTurnIds: string[];
}

export interface FactualDispute {
  claim: string;
  status: "unresolved" | "partially_resolved";
  treatment: string;
  couldAffectOutcome: boolean;
  evidenceTurnIds: string[];
}

export interface IntegrityConcern {
  player: PlayerLabel;
  kind:
    | "contradiction"
    | "fallacy"
    | "fabrication"
    | "misrepresentation"
    | "personal_attack"
    | "other";
  description: string;
  severity: "minor" | "material" | "severe";
  evidenceTurnIds: string[];
}

export interface JudgeBallot {
  schemaVersion: typeof JUDGING_SCHEMA_VERSION;
  debateId: string;
  judgeId: string;
  model: string;
  variant: JudgeVariant;
  winner: BallotWinner;
  margin: BallotMargin;
  confidence: BallotConfidence;
  decisionSummary: string;
  decisiveIssues: string[];
  majorClashes: ClashAssessment[];
  playerA: {
    rubric: PlayerRubric;
    feedback: PlayerFeedback;
  };
  playerB: {
    rubric: PlayerRubric;
    feedback: PlayerFeedback;
  };
  unresolvedFactualDisputes: FactualDispute[];
  integrityConcerns: IntegrityConcern[];
}

export interface BallotValidation {
  valid: boolean;
  errors: string[];
}

export interface VoteCounts {
  player_a: number;
  player_b: number;
  tie: number;
}

export interface PanelResult {
  winner: BallotWinner;
  voteCounts: VoteCounts;
  validBallots: number;
  invalidBallots: number;
  resultStrength: BallotMargin;
  confidence: BallotConfidence;
  requiresEscalation: boolean;
  escalationReasons: string[];
}

export interface JudgingSynthesis {
  winner: BallotWinner;
  resultStrength: BallotMargin;
  headline: string;
  explanation: string;
  playerA: PlayerFeedback;
  playerB: PlayerFeedback;
  consensus: string[];
  disagreements: string[];
  unresolvedFacts: string[];
}

export interface JudgeCallUsage {
  judgeId: string;
  model: string;
  variant: JudgeVariant | "synthesis";
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface JudgingResult {
  debateId: string;
  panel: PanelResult;
  ballots: JudgeBallot[];
  synthesis: JudgingSynthesis;
  escalated: boolean;
  usage: JudgeCallUsage[];
}
