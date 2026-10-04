import { aggregatePanel, validateBallot } from "./aggregate";
import type {
  DebateForJudging,
  JudgeBallot,
  JudgeCallUsage,
  JudgeVariant,
  JudgingResult,
  JudgingSynthesis,
} from "./types";

export const PRIMARY_JUDGE_MODEL = "gemini-3.8-flash";
export const ESCALATION_JUDGE_MODEL = "gemini-3.1-pro-preview";

export interface BallotRequest {
  debate: DebateForJudging;
  judgeId: string;
  model: string;
  variant: JudgeVariant;
  thinkingLevel: "medium" | "high";
}

export interface SynthesisRequest {
  debate: DebateForJudging;
  panel: ReturnType<typeof aggregatePanel>;
  ballots: JudgeBallot[];
}

export interface Generated<T> {
  value: T;
  usage?: JudgeCallUsage;
}

export interface JudgingDependencies {
  generateBallot(request: BallotRequest): Promise<Generated<JudgeBallot>>;
  generateSynthesis(request: SynthesisRequest): Promise<Generated<JudgingSynthesis>>;
}

const INITIAL_JUDGES: Omit<BallotRequest, "debate">[] = [
  { judgeId: "flash-standard", model: PRIMARY_JUDGE_MODEL, variant: "standard", thinkingLevel: "medium" },
  { judgeId: "flash-bias-check", model: PRIMARY_JUDGE_MODEL, variant: "bias_check", thinkingLevel: "medium" },
  { judgeId: "flash-independent", model: PRIMARY_JUDGE_MODEL, variant: "independent", thinkingLevel: "medium" },
];

const PRO_ESCALATION_JUDGES: Omit<BallotRequest, "debate">[] = [
  { judgeId: "pro-escalation", model: ESCALATION_JUDGE_MODEL, variant: "escalation", thinkingLevel: "high" },
  { judgeId: "pro-escalation-bias-check", model: ESCALATION_JUDGE_MODEL, variant: "escalation_bias_check", thinkingLevel: "high" },
];

const FLASH_FALLBACK_JUDGES: Omit<BallotRequest, "debate">[] = PRO_ESCALATION_JUDGES.map((judge) => ({
  ...judge,
  judgeId: judge.judgeId.replace("pro-", "flash-fallback-"),
  model: PRIMARY_JUDGE_MODEL,
  thinkingLevel: "medium" as const,
}));

export async function runJudgingPipeline(
  debate: DebateForJudging,
  dependencies: JudgingDependencies
): Promise<JudgingResult> {
  const initial = await runPanel(debate, INITIAL_JUDGES, dependencies);
  let ballots = initial.ballots;
  let usage = initial.usage;
  let panel = aggregatePanel(ballots, debate, INITIAL_JUDGES.length);
  const escalated = panel.requiresEscalation;

  if (escalated) {
    const pro = await runPanel(debate, PRO_ESCALATION_JUDGES, dependencies);
    const missing = PRO_ESCALATION_JUDGES.length - pro.ballots.length;
    let escalationBallots = pro.ballots;
    let escalationUsage = pro.usage;

    if (missing > 0) {
      const fallback = await runPanel(
        debate,
        FLASH_FALLBACK_JUDGES.slice(0, missing),
        dependencies
      );
      escalationBallots = [...escalationBallots, ...fallback.ballots];
      escalationUsage = [...escalationUsage, ...fallback.usage];
    }

    ballots = [...ballots, ...escalationBallots];
    usage = [...usage, ...escalationUsage];
    panel = aggregatePanel(ballots, debate, INITIAL_JUDGES.length + PRO_ESCALATION_JUDGES.length);
  }

  if (panel.validBallots < 3) {
    throw new Error("The judging panel did not return enough valid ballots.");
  }

  const synthesisResult = await dependencies.generateSynthesis({ debate, panel, ballots });
  const synthesis = synthesisResult.value;
  if (synthesis.winner !== panel.winner || synthesis.resultStrength !== panel.resultStrength) {
    throw new Error("The synthesis attempted to alter the deterministic panel result.");
  }
  if (synthesisResult.usage) usage.push(synthesisResult.usage);

  return { debateId: debate.debateId, panel, ballots, synthesis, escalated, usage };
}

async function runPanel(
  debate: DebateForJudging,
  judges: Omit<BallotRequest, "debate">[],
  dependencies: JudgingDependencies
): Promise<{ ballots: JudgeBallot[]; usage: JudgeCallUsage[] }> {
  const settled = await Promise.allSettled(
    judges.map((judge) => generateValidBallotWithRetry({ debate, ...judge }, dependencies))
  );

  const completed = settled
    .filter((result): result is PromiseFulfilledResult<Generated<JudgeBallot>> => result.status === "fulfilled")
    .map((result) => result.value);

  return {
    ballots: completed.map((result) => result.value),
    usage: completed.flatMap((result) => (result.usage ? [result.usage] : [])),
  };
}

async function generateValidBallotWithRetry(
  request: BallotRequest,
  dependencies: JudgingDependencies
): Promise<Generated<JudgeBallot>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const generated = await dependencies.generateBallot(request);
      const validation = validateBallot(generated.value, request.debate);
      if (!validation.valid) throw new Error(`Invalid ballot: ${validation.errors.join(" ")}`);
      return generated;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Judge call failed.");
}
