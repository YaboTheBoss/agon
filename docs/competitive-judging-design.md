# Yaapi Competitive Judging Design

> **Superseded (Oct 2026):** comp debates now use free chat with AI points every 6 messages and a winner by points. See [`comp-points-design.md`](comp-points-design.md). Kept for reference.

Status: Working design

This document defines the current design for judging completed competitive debates in Yaapi. It covers the judging principles, panel architecture, escalation behavior, rubric, factual uncertainty, aggregation, feedback synthesis, and relationship between judge agreement and rating changes.

The competitive match format is specified separately in `docs/competitive-match-design.md`.

## Goals

The judging system should:

- Select the player who won the debate as it actually developed.
- Evaluate the entire debate rather than score isolated messages.
- Reward reasoning, engagement, comparison, and persuasion under impromptu conditions.
- Consider factual accuracy without turning the match into a research or citation contest.
- Avoid favoring a position because of its ideology, popularity, or familiarity.
- Avoid bias from usernames, player history, ratings, audience reactions, or personal beliefs.
- Explain the result with direct references to the transcript.
- Allow genuine ties and acknowledge uncertainty.
- Use disagreement between judges as useful information rather than hide it.

## What the judge receives

Every judge receives:

- The exact topic or motion
- The two assigned positions
- Any official shared context card
- The complete debate transcript
- Phase labels: opening, engagement, and closing
- Anonymous player labels
- The shared judging rubric and instructions

Every judge must not receive:

- Usernames or profiles
- Player ratings or match histories
- Whether a position was chosen or randomly assigned
- Audience reactions, likes, or cheers
- Running scores
- Prior judges' ballots
- Which participant is the current app user

## Timing

- Scoring occurs only after both closing statements have been submitted.
- No official points or preliminary rulings are shown during the debate.
- Judges run in parallel where possible.
- Judging begins as soon as both closings are available and runs during the approximately one-minute closing-reading period.

## Core adjudication method

The official outcome is a comparative ballot, not the sum of independent writing scores.

Each judge should reason in this order:

1. Determine what each position needed to establish.
2. Identify the major points of disagreement in the debate.
3. Determine which arguments survived engagement.
4. Determine the importance of each surviving argument.
5. Compare which player won the most important clashes.
6. Return Player A, Player B, or Tie.

Judges should ask whether premises, reasoning, and consequences were answered; whether responses were themselves answered; and whether the players explained why their surviving arguments should decide the topic.

The winner is not necessarily the player who:

- Made more claims
- Wrote more text
- Used more statistics
- Used more sophisticated vocabulary
- Sounded more confident
- Earned the highest unweighted category total

## Hierarchical rubric

The rubric helps judges analyze and explain the debate. It does not replace the comparative ballot.

### 1. Winning the substantive clash — 35%

Evaluate whether the player's central case survived and whether the player defeated or neutralized the opponent's central case.

Relevant questions:

- Which central claims remained standing?
- Which important rebuttals were answered?
- Did the player satisfy the burden created by their assigned position?
- Did the player win the issues that actually decide the topic?

### 2. Engagement and responsiveness — 25%

Evaluate whether the player engaged the opponent rather than delivering disconnected statements.

Relevant questions:

- Did the player address the opponent's strongest arguments?
- Were important arguments dropped or evaded?
- Did the player respond to rebuttals?
- Did the player represent the opponent accurately?
- Did the player adapt as the debate developed?

### 3. Comparative weighing — 20%

Evaluate whether the player explained why their surviving arguments matter more.

Relevant comparisons include:

- Importance or magnitude
- Likelihood
- Scope
- Practical consequences
- Competing values or definitions
- Whether an argument meaningfully distinguishes the two positions

### 4. Logical and factual integrity — 10%

Evaluate whether the player reasoned consistently and handled factual claims honestly.

Relevant questions:

- Do conclusions follow from their premises?
- Are there material contradictions?
- Are uncertain claims qualified appropriately?
- Are there serious fallacies or unsupported leaps?
- Did the player fabricate or misrepresent a source, quotation, rule, or fact?

### 5. Clarity and communication — 10%

Evaluate whether the player's contribution was understandable, organized, and precise.

Do not reward or punish a player merely for:

- Message length
- Fancy vocabulary
- Debate jargon
- Native-English fluency
- Minor grammar or spelling errors
- Aggressive confidence
- Formatting style

Communication should affect the result only to the extent that it changes how effectively arguments are presented and understood.

## Category ratings

Each judge may rate both players from 1 to 5 on each rubric dimension. Each value must have a written anchor:

- 1: Seriously deficient
- 2: Weak
- 3: Adequate
- 4: Strong
- 5: Exceptional

These ratings support feedback, debugging, and future calibration. They are not simply added together to select the winner.

A player may have strong logic and communication ratings while still losing because the opponent defeated their central case, won the important clashes, or performed better comparative weighing.

## Avoiding double-counting

Judges should avoid punishing one mistake repeatedly.

For example, a straw man may mean that a player failed to engage the opponent's real argument and therefore lost that clash. It should not automatically create additional unrelated deductions in every category.

Likewise, an unsupported factual premise should reduce the weight of the argument that depends on it. It should not automatically create repeated penalties unless the behavior is recurrent, clearly dishonest, or independently damages multiple parts of the case.

## Evidence-light factual policy

Yaapi competitive debate is impromptu and evidence-light:

- Citations are not required.
- External research is not expected during a match.
- Judges do not independently browse the web.
- Common, uncontested knowledge may be used normally.
- Specialized knowledge may be introduced, but assertion alone does not establish it.
- An official context card is treated as established for the match.
- When an important factual claim is disputed and cannot be resolved from the transcript and context card, the judge marks it unresolved.
- Arguments that depend materially on unresolved claims receive less weight.
- Players receive credit for qualifying uncertainty and reasoning conditionally.
- Obvious falsehoods, fabricated sources or quotations, and dishonest representations may be penalized.

Judges must not invent a factual ruling about obscure, local, or inaccessible information. For example, if players disagree about undocumented campus bus delays, the judge should evaluate how responsibly each player handles the uncertainty rather than pretend to know which description is true.

## Panel architecture

### Initial panel

Every completed debate is judged by three independent calls run in parallel.

For the MVP, all three use `gemini-3.8-flash` and the same core rubric. This provides a consistent standard while independent calls reveal sampling variation.

The initial reasoning level remains configurable until evaluation determines the best quality, latency, and cost tradeoff. Medium reasoning is the starting benchmark configuration.

The initial calls are:

1. Standard holistic judge
2. Bias-check judge with anonymous player labels and side ordering reversed where possible
3. Independent holistic repeat

The chronological transcript must remain coherent. Bias-check transformations must not reorder turns in a way that changes the debate.

### Escalation panel

Two additional judges are added when any escalation condition is met. Both escalation calls use `gemini-3.1-pro-preview`, subject to availability and model lifecycle changes.

The escalation reasoning level remains configurable. High reasoning is the starting benchmark configuration because escalation is reserved for close or uncertain debates.

Escalation conditions include:

- The initial three ballots are not unanimous
- The verdict changes under the presentation-bias check
- Initial judges identify materially different decisive issues
- Important factual disputes remain unresolved and could determine the winner
- One or more judges report low confidence
- A ballot is invalid, unsupported, internally inconsistent, or fails schema validation
- Another automated consistency check identifies a material problem

The two escalation calls are:

4. Stronger-model holistic judge
5. Stronger-model bias-check judge

If the Pro model is unavailable or times out, two additional independent calls to `gemini-3.8-flash` may be used as a fallback. The result metadata must record that the fallback was used.

### Future model diversity

A multi-provider or multi-family panel should be considered only after candidate models are calibrated against the same set of human-adjudicated debates.

Model diversity is not automatically beneficial. A weaker or poorly calibrated model can add noise, and models may use numerical scales differently. No model should receive a vote merely to create superficial diversity.

## Judge ballot

Each judge returns structured output containing at least:

- `winner`: `player_a`, `player_b`, or `tie`
- `margin`: `narrow`, `clear`, or `decisive`
- `confidence`: `low`, `medium`, or `high`
- Rubric ratings for both players
- Major clashes
- Decisive issues
- Exact transcript references supporting the decision
- What Player A did well
- What Player A could improve
- What Player B did well
- What Player B could improve
- Unresolved factual disputes
- Rule or integrity concerns

The production schema should use stable message or turn identifiers rather than relying only on copied quotations.

Self-reported confidence is diagnostic. It does not override the vote or directly determine the result.

## Aggregating ballots

The application calculates the official result deterministically. A model does not get to rewrite or override the panel vote.

- Each valid judge has one ballot.
- Player A or Player B wins by majority.
- A collective tie is allowed.
- The result records the ballot count.
- The median valid margin may be used to describe the strength of the win.
- Contradictory or invalid ballots trigger escalation or error handling rather than being silently accepted.

Possible five-judge results include:

- 5–0: unanimous
- 4–1: clear panel agreement
- 3–2: narrow panel agreement
- A majority of tie ballots: tie

The result shown to users may include both a descriptive label and the vote count, such as "Narrow win, 3–2."

## Result synthesis

After deterministic aggregation, a separate synthesis call receives:

- The transcript
- The valid ballots
- The official winner or tie
- The official vote count
- The computed result strength

The synthesizer explains:

- Why the winner won
- What each player did best
- What each player could improve
- Which clashes decided the debate
- Where judges disagreed
- Which factual claims remained unresolved
- Why the result was narrow, clear, or decisive

The synthesizer cannot change the official result, ballot count, or rating calculation.

The user-facing explanation should combine panel reasoning rather than display nine or five repetitive essays. Individual ballots may be retained for audit and debugging.

## Live analysis and fallacy detection

The MVP does not publicly announce fallacies or inconsistencies during competitive play. Live rulings could coach one side, interrupt the debate, anchor the final judgment, and make an incorrect provisional ruling disproportionately influential.

A future hidden debate tracker may record candidate claims, responses, concessions, contradictions, and fallacies. Such findings are notes rather than rulings and must not create live points. The final panel remains responsible for evaluating the complete debate.

Safety moderation and troll or abuse detection are separate systems from competitive judging.

## Rating impact

Standard ELO calculations should account for the players' existing ratings. Panel agreement and result strength may scale the size of the adjustment.

Illustrative multipliers:

| Panel result | Interpretation | Example multiplier |
| --- | --- | ---: |
| 3–0 without escalation | Clear initial consensus | 1.0x |
| 5–0 after escalation for a non-verdict issue | Very strong consensus | 1.0x |
| 4–1 | Clear win | 0.8x |
| 3–2 | Narrow win | 0.5x |
| Collective tie or indeterminate result | Tie | 0–0.2x |

These values are placeholders and must be tested before production.

Raw category-score variance should not directly control ELO. Different calls or models may calibrate numerical scores differently. Ballot agreement, result margin, consistency, and confidence are stronger signals.

## Calibration and testing requirements

Before treating the system as reliable, the team should create a set of human-adjudicated sample debates containing:

- Clear wins for each side
- Narrow wins
- Genuine ties
- Strong presentation with weak engagement
- Weak presentation with decisive substantive engagement
- Dropped arguments
- Recoveries from early mistakes
- Contradictions and moving goalposts
- Unresolved local factual disputes
- Plausible but false claims
- Subjective and objective topics
- Different writing styles and levels of English fluency

For each prompt or model revision, compare:

- Agreement with human winners
- Agreement on narrow versus clear outcomes
- Position-swap consistency
- Repeat-run consistency
- False fallacy accusations
- Sensitivity to verbosity and style
- Accuracy of transcript references
- Frequency and causes of escalation
- Latency and cost

The model and prompt should remain configurable. A model should be selected because it performs well on this test set, not only because it is newer, larger, or marketed as more capable.

## MVP implementation

The server exposes `POST /api/judging/evaluate`. The request is one completed debate with stable turn IDs, assigned positions, an optional context card, and the chronological transcript. Calls must authenticate with either the signed-in user's Google ID token in the `Authorization` header or the trusted backend's `X-Yaapi-Internal-Key` header.

The route runs three Flash ballots in parallel, retries a failed or invalid ballot once, and adds two Pro ballots when the deterministic aggregator requests escalation. If a Pro call still fails, a Flash fallback fills that panel seat. The application—not the synthesis model—computes the winner, vote count, confidence, and result strength. A final structured Flash call turns the ballots into user-facing feedback and is rejected if it attempts to alter the official result.

The response includes all valid ballots and per-call token usage for debugging and cost measurement. Production storage may retain the full response privately while exposing only the synthesized feedback to players.

## Remaining questions

- Exact ELO formula and agreement multipliers
- Storage duration and player visibility of individual ballots
- Appeal and rejudging behavior
- Human review or moderation path for disputed outcomes
- Size and construction of the human-adjudicated calibration set
- Production rate limits and authorization against the completed match record
