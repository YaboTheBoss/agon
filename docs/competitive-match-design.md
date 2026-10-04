# Yaapi Competitive Match Design

> **Superseded (Oct 2026):** comp debates now use free chat with AI points every 6 messages and a winner by points. See [`comp-points-design.md`](comp-points-design.md). Kept for reference.

Status: Working design

This document records the current decisions for Yaapi's competitive, real-time, human-versus-human debate mode. It covers topic selection, matchmaking, timing, turn flow, and the handoff to final judging. The judging rubric and implementation will be specified separately.

## Product intent

Competitive Yaapi is a short, synchronous, impromptu debate. Players should succeed by reasoning from common knowledge, constructing a case quickly, engaging with an opponent, and communicating persuasively. It should not require hours of advance research or continue asynchronously throughout the day.

The assigned position is a role in the debate, not a statement of the player's personal beliefs.

## Topics

- Official topics may cover meaningful issues without depending on highly sensitive or polarizing subjects.
- Communities may offer local, user-created topics, such as campus-specific questions.
- Custom competitive topics are screened by AI before entering matchmaking.
- Topic screening evaluates clarity, balance, safety, accessibility without research, and whether both positions are genuinely defensible.
- A screening result is one of:
  - Accepted
  - Accepted with suggested wording
  - Rejected, with a concise reason and a suggested revision when possible
- A topic may include a short shared context card containing definitions, agreed structural facts, exact source text, or explicit assumptions. It should not supply arguments for either side.

## Matchmaking

- Competitive matches are synchronous and require both players to remain present.
- Matchmaking pairs two human players on one topic.
- Positions are assigned randomly when the match begins.
- Selecting "Either" means the player accepts whichever position is needed.
- A coin-flip animation determines which player begins the engagement phase. This selection is independent of which position each player receives.
- The opposing player sees only complete submitted responses, never live typing or partial drafts.

Matchmaking implementation and rating-aware pairing remain to be designed with the SpacetimeDB backend.

## Competitive match flow

### 1. Match reveal

The app reveals:

- The topic
- Both assigned positions
- Any shared context card
- The competitive rules and timers

There is currently no separate preparation phase. Players use the hidden opening phase to prepare and construct their initial cases.

### 2. Hidden opening statements

- Both players compose simultaneously.
- Each player has a maximum of 2 minutes.
- Early submission is allowed.
- A submitted opening remains hidden until both players submit or the timer expires.
- The two openings are then revealed simultaneously.
- Pasting text is not allowed. Native operating-system dictation is allowed.

The product preserves an unfinished local draft if the opening timer expires. The unsubmitted opening counts as a pass and is not published.

### 3. Coin flip

- A visible coin-flip animation selects the player who sends the first engagement response.
- The result affects engagement order only and does not change assigned positions.

### 4. Live engagement

- Players alternate complete submitted responses.
- Each player receives a 5-minute total engagement clock.
- A player's total clock runs only while it is that player's turn.
- Every individual response also has a 90-second maximum response clock.
- Submitting early ends the current turn and preserves the unused portion of the player's total engagement clock.
- No partial response is shown to the opponent.

If the 90-second response clock expires:

- The unfinished draft is retained locally for the player.
- The draft is not automatically published.
- The turn counts as a pass.
- The time used is still deducted from the player's 5-minute engagement clock.
- Two consecutive passes by the same player count as yielding engagement.

A player may also explicitly select "Yield engagement." When a player yields, the opponent receives one final engagement response before the match moves to closing statements.

The engagement phase has no fixed number of messages. Its maximum duration is bounded by the two players' 5-minute clocks.

### 5. Hidden closing statements

- Both players compose simultaneously.
- Each player has 90 seconds.
- Early submission is allowed.
- A submitted closing remains hidden until both players submit or the timer expires.
- Closings are revealed simultaneously.
- Closings should compare and weigh arguments already made. They should not introduce major new arguments.

### 6. Reading and judging

- After both closings appear, the players receive approximately 1 minute to read them.
- The final scoring judge runs concurrently during this reading period.
- Audience reactions, cheers, and message likes are cosmetic and must not be provided to the judge or affect the outcome.
- The judge receives an anonymized complete debate only after both closings have been submitted.
- Scores remain hidden until final judging is complete.
- The result may be a win for either player or a tie.
- The strength of the result, such as a narrow or decisive win, may later affect rating changes.

## Evidence and factual claims

Competitive debate is evidence-light and impromptu:

- Citations are not required.
- External research is not expected during a match.
- The final judge does not independently browse the web.
- Common, uncontested knowledge may be used normally.
- Specialized knowledge may be introduced, but assertion alone does not establish it.
- When an important factual claim is disputed and cannot be resolved from the transcript and shared context, the judge treats it as unresolved.
- Arguments that depend on an unresolved factual claim receive less weight.
- Players should receive credit for qualifying uncertainty and reasoning conditionally.
- Obvious falsehoods, fabricated sources or quotations, contradictions, and dishonest representations may be penalized.

The judge evaluates argumentative quality and factual integrity without favoring a position because of its ideology or popularity.

## Spectators

- Spectators may watch competitive debates live.
- Spectators may react to or like messages during the debate.
- Reactions are cosmetic social feedback only.
- Spectator activity must not influence matchmaking, live debate order, judging, scores, or the winner.

## Expected duration

Approximate maximum duration:

- Hidden opening: 2 minutes
- Engagement: 10 minutes total across both player clocks
- Hidden closing: 90 seconds
- Reading and judging: 1 minute
- Short transitions and coin-flip animation

A match should therefore finish in roughly 15 minutes or less.

## Open implementation questions

- Reconnection and network interruption rules
- Forfeit and abandonment behavior beyond treating an exhausted engagement clock as a yield
- Whether official, community, and private matches use separate rating pools
- Rating formula and how narrow wins, decisive wins, and ties affect it
- Topic-vetting prompt, thresholds, appeals, and community moderation
- Anti-cheating measures beyond disabling paste
