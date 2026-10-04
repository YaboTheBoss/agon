import type { BallotWinner, DebateForJudging } from "./types";

export interface ProvisionalDebateFixture {
  name: string;
  purpose: string;
  expectedWinner: BallotWinner;
  expectedMargin: "none" | "narrow" | "clear" | "decisive";
  debate: DebateForJudging;
  adjudicationNotes: string[];
}

/**
 * Synthetic, provisional fixtures for prompt development. They are not a
 * substitute for debates independently labeled by experienced human judges.
 */
export const provisionalDebateFixtures: ProvisionalDebateFixture[] = [
  {
    name: "clear engagement win",
    purpose: "A polished opening loses after its central premise is answered and never restored.",
    expectedWinner: "player_b",
    expectedMargin: "clear",
    debate: {
      debateId: "fixture-clear-engagement",
      topic: "Schools should replace most group projects with individual assignments.",
      positionA: "Replace most group projects",
      positionB: "Keep most group projects",
      turns: [
        { id: "a-o", phase: "opening", speaker: "player_a", text: "Group projects create unfair grades because one student often carries the team. Individual work measures each student's actual ability and removes conflict over schedules." },
        { id: "b-o", phase: "opening", speaker: "player_b", text: "Schools should keep group projects because collaboration is itself a skill. The problem is poor project design, which can be addressed with individual role logs and peer assessment." },
        { id: "a-e1", phase: "engagement", speaker: "player_a", text: "Peer assessments become popularity contests, so they do not solve unfairness. Students can learn teamwork in clubs without risking grades." },
        { id: "b-e1", phase: "engagement", speaker: "player_b", text: "Role logs give teachers direct evidence beyond popularity. Clubs are optional and exclude students who work or commute, so moving teamwork there denies many students practice." },
        { id: "a-e2", phase: "engagement", speaker: "player_a", text: "Individual assignments are simply more accurate and less stressful." },
        { id: "b-e2", phase: "engagement", speaker: "player_b", text: "Accuracy is not the only educational goal. A mixed grade can separately score the group result and each person's documented contribution, preserving measurement while teaching coordination." },
        { id: "a-c", phase: "closing", speaker: "player_a", text: "Individual work is fairer and avoids preventable stress, so schools should prefer it." },
        { id: "b-c", phase: "closing", speaker: "player_b", text: "A redesigned group project answers the fairness objection while retaining a skill that individual assignments cannot teach. Player A never answered the access problem with relying on clubs." },
      ],
    },
    adjudicationNotes: [
      "Player B directly answers grading fairness with separate contribution records.",
      "Player A repeats fairness without answering the redesigned grading mechanism.",
      "Player B explains why clubs are not an equivalent substitute.",
    ],
  },
  {
    name: "narrow weighing win",
    purpose: "Both cases survive, but one closing performs better comparative weighing.",
    expectedWinner: "player_a",
    expectedMargin: "narrow",
    debate: {
      debateId: "fixture-narrow-weighing",
      topic: "Campus dining halls should stay open two hours later.",
      positionA: "Stay open later",
      positionB: "Keep current hours",
      contextCard: "Assume later hours require rearranging existing staff shifts but no additional total staffing hours.",
      turns: [
        { id: "a-o", phase: "opening", speaker: "player_a", text: "Later hours serve students with evening labs, jobs, and practices. Rearranging shifts makes existing dining access fit actual student schedules." },
        { id: "b-o", phase: "opening", speaker: "player_b", text: "Keeping current hours concentrates service when demand is highest and avoids reducing staff during breakfast or lunch." },
        { id: "a-e1", phase: "engagement", speaker: "player_a", text: "The proposal need not cut peak coverage equally; it can move the quietest early-hour staffing. Missing dinner entirely is a larger harm than waiting slightly longer during an off-peak breakfast period." },
        { id: "b-e1", phase: "engagement", speaker: "player_b", text: "You assume early hours are quiet without evidence. A worse morning line affects many students, while late users are a smaller group with other food options." },
        { id: "a-e2", phase: "engagement", speaker: "player_a", text: "Both group sizes are uncertain. The key difference is severity: one side faces inconvenience, while the other may lose access to a prepaid meal altogether." },
        { id: "b-e2", phase: "engagement", speaker: "player_b", text: "Late students can plan ahead or take food before closing. Morning students cannot move scheduled classes when a line is longer." },
        { id: "a-c", phase: "closing", speaker: "player_a", text: "Neither side established exact demand. Under that uncertainty, protect against the larger irreversible harm: losing a meal already paid for. Morning congestion is real but adjustable and less severe." },
        { id: "b-c", phase: "closing", speaker: "player_b", text: "Current hours serve the established majority. Changing them based on uncertain late demand risks making the system worse for more people." },
      ],
    },
    adjudicationNotes: [
      "Both sides have plausible access arguments.",
      "Player A explicitly handles uncertainty and compares severity.",
      "The win should remain narrow because Player B preserves a credible scope argument.",
    ],
  },
  {
    name: "genuine tie",
    purpose: "Balanced arguments remain unresolved without inventing a distinction.",
    expectedWinner: "tie",
    expectedMargin: "none",
    debate: {
      debateId: "fixture-tie",
      topic: "Apples are a better everyday snack than bananas.",
      positionA: "Apples are better",
      positionB: "Bananas are better",
      turns: [
        { id: "a-o", phase: "opening", speaker: "player_a", text: "Apples are sturdier, keep longer, and offer more texture, making them more dependable to carry every day." },
        { id: "b-o", phase: "opening", speaker: "player_b", text: "Bananas are easier to peel, softer to eat, and naturally portioned, making them more convenient for more people." },
        { id: "a-e1", phase: "engagement", speaker: "player_a", text: "Bananas bruise quickly in a bag. Convenience disappears when the snack becomes mush before lunch." },
        { id: "b-e1", phase: "engagement", speaker: "player_b", text: "Apples require stronger teeth and leave a core. A banana's peel protects the edible part and is easier for children or people with dental sensitivity." },
        { id: "a-c", phase: "closing", speaker: "player_a", text: "For repeated daily use, shelf life and durability make apples the more reliable choice." },
        { id: "b-c", phase: "closing", speaker: "player_b", text: "For immediate everyday use, easy peeling and accessibility make bananas the more convenient choice." },
      ],
    },
    adjudicationNotes: [
      "Each player defends a different reasonable meaning of everyday convenience.",
      "Neither side compares the competing criteria well enough to resolve the motion.",
    ],
  },
  {
    name: "unresolved local fact",
    purpose: "The judge must not invent knowledge about a campus bus route.",
    expectedWinner: "player_b",
    expectedMargin: "narrow",
    debate: {
      debateId: "fixture-local-fact",
      topic: "Commuter North should have fewer stops.",
      positionA: "Fewer stops",
      positionB: "Keep the stops",
      turns: [
        { id: "a-o", phase: "opening", speaker: "player_a", text: "Commuter North is always at least ten minutes late because it has too many stops. Removing two would make it reliable." },
        { id: "b-o", phase: "opening", speaker: "player_b", text: "Those stops connect students who live far from campus. Removing them shifts travel time onto riders with the fewest alternatives." },
        { id: "a-e1", phase: "engagement", speaker: "player_a", text: "Everyone I know complains about delays, and faster buses would benefit all remaining riders." },
        { id: "b-e1", phase: "engagement", speaker: "player_b", text: "Neither of us has established the delay rate or that stops cause it rather than traffic. Even if some delay exists, removal guarantees a serious access loss while the time benefit remains uncertain." },
        { id: "a-c", phase: "closing", speaker: "player_a", text: "The route's lateness is obvious to regular riders. Fewer stops directly solve that problem." },
        { id: "b-c", phase: "closing", speaker: "player_b", text: "Do not trade a certain access loss for an unproven fix. Player A never established either the size or cause of the alleged delay." },
      ],
    },
    adjudicationNotes: [
      "The actual delay and its cause must remain unresolved.",
      "Player B wins narrowly by reasoning conditionally and comparing certainty.",
      "Player A should not be punished merely because the judge lacks local knowledge, but the unsupported premise carries little weight.",
    ],
  },
  {
    name: "recovery from early error",
    purpose: "The judge must evaluate the whole debate rather than lock in an opening mistake.",
    expectedWinner: "player_a",
    expectedMargin: "narrow",
    debate: {
      debateId: "fixture-recovery",
      topic: "First-year students should be required to live on campus.",
      positionA: "Require on-campus living",
      positionB: "Do not require it",
      turns: [
        { id: "a-o", phase: "opening", speaker: "player_a", text: "Every first-year student can live on campus, and requiring it builds community and makes support services easier to reach." },
        { id: "b-o", phase: "opening", speaker: "player_b", text: "A requirement ignores cost, disability, family obligations, and students who already live nearby. Community cannot justify removing those choices." },
        { id: "a-e1", phase: "engagement", speaker: "player_a", text: "I overstated that everyone can do it. The requirement should include hardship exemptions and sufficient aid. For students without those barriers, shared residence creates repeated contact and earlier connection to campus help." },
        { id: "b-e1", phase: "engagement", speaker: "player_b", text: "Once exemptions exist, the policy admits that choice matters. Clubs and orientation can build connection without controlling housing." },
        { id: "a-e2", phase: "engagement", speaker: "player_a", text: "An exemption does not defeat a general rule; it limits the rule where its costs are excessive. Optional events do not create the routine contact or immediate peer network of living together." },
        { id: "b-e2", phase: "engagement", speaker: "player_b", text: "Residence does not guarantee friendship, and forcing reluctant students together can make adjustment worse." },
        { id: "a-c", phase: "closing", speaker: "player_a", text: "The corrected policy protects genuine hardship while preserving a default environment that reliably creates more opportunities for connection and access to help than optional programs." },
        { id: "b-c", phase: "closing", speaker: "player_b", text: "Player A began with an indefensible universal claim. Students should decide which environment best supports them rather than face a presumption they must disprove." },
      ],
    },
    adjudicationNotes: [
      "Player A concedes and repairs the universal claim rather than contradicting it silently.",
      "Player B does not fully answer the distinction between a general rule and hardship exemptions.",
      "The early overclaim lowers integrity but should not decide the debate after a clear correction.",
    ],
  },
];

