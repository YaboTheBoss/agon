import type { DebateForJudging, JudgeBallot, JudgeVariant, PanelResult } from "./types";

const RUBRIC = `Evaluate the debate comparatively using this priority order:
1. Substantive clash and case strength (35%): which side established and defended the more important claims.
2. Engagement and rebuttal (25%): which side directly answered the opponent's strongest arguments.
3. Comparative weighing (20%): which side best explained why its benefits, harms, principles, or tradeoffs matter more.
4. Logical and factual integrity (10%): internal consistency, sound inferences, and responsible treatment of factual claims.
5. Clarity and communication (10%): understandable, organized, concise advocacy.

The percentages are guides, not an additive points formula. The winner is the side that won the debate's decisive clashes. Strong prose cannot compensate for losing the core argument.`;

const RULES = `Rules:
- Judge only the supplied debate. Do not browse, use tools, or import obscure outside facts.
- Common knowledge may inform plausibility, but do not punish a side because you personally oppose its assigned position.
- Treat unsupported, locally specific, or unverifiable claims cautiously. Record a dispute as unresolved when appropriate; do not invent certainty.
- Penalize demonstrably false claims, contradictions, fallacies, evasion, misrepresentation, and personal attacks in proportion to their effect on the debate.
- Do not reward length, confidence, rhetorical flourish, or repetition by itself.
- A player may recover from an early mistake. Evaluate the completed debate as a whole.
- Use only the exact transcript turn IDs as evidence. Empty evidence arrays are allowed only when a category genuinely lacks a relevant turn.
- A tie means neither player earned a meaningful comparative advantage. Do not use a tie merely because both players had flaws.
- margin must be none for a tie, and narrow, clear, or decisive for a winner.
- Return only the requested structured JSON.`;

const VARIANT_INSTRUCTIONS: Record<JudgeVariant, string> = {
  standard: "Render an independent, neutral ballot.",
  bias_check: "Act as a presentation-bias auditor. Deliberately check for position bias, first-speaker bias, verbosity bias, and polished-writing bias before rendering an independent ballot.",
  independent: "Render a fresh independent ballot. Do not speculate about how other judges might vote.",
  escalation: "This is an escalation ballot for a potentially close or uncertain debate. Scrutinize the decisive clashes and factual uncertainty especially carefully.",
  escalation_bias_check: "This is an escalation and bias-audit ballot. Scrutinize close clashes while explicitly guarding against position, order, verbosity, and style bias.",
};

export function buildJudgeSystemInstruction(variant: JudgeVariant): string {
  return `You are one member of Yaapi's independent debate judging panel. ${VARIANT_INSTRUCTIONS[variant]}\n\n${RUBRIC}\n\n${RULES}`;
}

export function buildJudgePrompt(
  debate: DebateForJudging,
  metadata: { judgeId: string; model: string; variant: JudgeVariant }
): string {
  const positions = metadata.variant.includes("bias_check")
    ? `Player B assigned position: ${debate.positionB}\nPlayer A assigned position: ${debate.positionA}`
    : `Player A assigned position: ${debate.positionA}\nPlayer B assigned position: ${debate.positionB}`;

  return `Fill out one complete judge ballot for this debate.

Required metadata (copy exactly):
- schemaVersion: 1.0.0
- debateId: ${JSON.stringify(debate.debateId)}
- judgeId: ${JSON.stringify(metadata.judgeId)}
- model: ${JSON.stringify(metadata.model)}
- variant: ${JSON.stringify(metadata.variant)}

Topic: ${debate.topic}
${positions}
${debate.contextCard ? `Shared context card: ${debate.contextCard}\n` : ""}
Transcript (chronological JSON; messages were shown only after submission):
${JSON.stringify(debate.turns, null, 2)}`;
}

export function buildSynthesisPrompt(
  debate: DebateForJudging,
  panel: PanelResult,
  ballots: JudgeBallot[]
): string {
  const official = { winner: panel.winner, resultStrength: panel.resultStrength };
  const compactBallots = ballots.map((ballot) => ({
    judgeId: ballot.judgeId,
    winner: ballot.winner,
    margin: ballot.margin,
    confidence: ballot.confidence,
    decisionSummary: ballot.decisionSummary,
    decisiveIssues: ballot.decisiveIssues,
    majorClashes: ballot.majorClashes,
    playerAFeedback: ballot.playerA.feedback,
    playerBFeedback: ballot.playerB.feedback,
    unresolvedFactualDisputes: ballot.unresolvedFactualDisputes,
  }));

  return `Synthesize the panel's ballots into concise, constructive post-debate feedback.
The deterministic official result is ${JSON.stringify(official)}. Copy winner and resultStrength exactly; you may explain but must not change them.
Distinguish panel consensus from meaningful disagreement. Do not claim factual certainty where judges recorded uncertainty. Address players as Player A and Player B.

Topic: ${debate.topic}
Player A position: ${debate.positionA}
Player B position: ${debate.positionB}
Panel vote: ${JSON.stringify(panel.voteCounts)}
Ballots:
${JSON.stringify(compactBallots, null, 2)}`;
}
