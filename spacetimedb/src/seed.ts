/**
 * First-publish seed: categories, demo topics, demo players and a few
 * finished/ongoing chats so the feed isn't empty. `removeDemoData` undoes the
 * fake parts (players, chats, made-up vote counts) and keeps the categories
 * and topics.
 */

import { Identity, Timestamp } from 'spacetimedb';
import type { Ctx } from './index';

const CATEGORIES = [
  { slug: 'trending', name: 'Trending', color: '#FFD43B', icon: 'flame', blurb: "What everyone's arguing about" },
  { slug: 'sports', name: 'Sports', color: '#7EE0B5', icon: 'ball', blurb: 'Hot takes from the bleachers' },
  { slug: 'music', name: 'Music', color: '#FF8FB1', icon: 'music', blurb: 'Your playlist is a hill to die on' },
  { slug: 'movies', name: 'Movies', color: '#8EA2FF', icon: 'film', blurb: 'Spoilers argued responsibly' },
  { slug: 'food', name: 'Food', color: '#FFB27A', icon: 'food', blurb: 'The most serious category' },
  { slug: 'tech', name: 'Tech', color: '#B9A6FF', icon: 'chip', blurb: 'AI, apps and the internet' },
  { slug: 'campus', name: 'Campus', color: '#9BE7F0', icon: 'cap', blurb: 'Dorms, classes, club drama' },
  { slug: 'games', name: 'Games', color: '#C8F27A', icon: 'game', blurb: 'GG, no re' },
];

// key, title, category, sideA, sideB, aPct, ePct, players, hot
const TOPICS: [string, string, string, string, string, number, number, number, boolean][] = [
  ['hotdog', 'Is a hot dog a sandwich?', 'food', 'Sandwich', 'Not a sandwich', 48, 12, 1832, true],
  ['ai-coursework', 'Should universities allow AI tools on graded coursework?', 'tech', 'Allow it', 'Ban it', 60, 14, 1204, false],
  ['remakes', 'Are movie remakes ruining cinema?', 'movies', 'Yes, stop', 'Remakes rule', 36, 16, 966, false],
  ['athletes', 'Should college athletes be paid like employees?', 'sports', 'Pay them', 'Keep it amateur', 55, 13, 742, true],
  ['vinyl', 'Does vinyl actually sound better than streaming?', 'music', 'Vinyl', 'Streaming', 33, 18, 455, false],
  ['age-verify', "Should social media verify every user's age?", 'tech', 'Verify', "Don't", 62, 12, 1530, true],
  ['pineapple', 'Pineapple belongs on pizza.', 'food', 'Belongs', 'Crime', 41, 15, 2210, true],
  ['book-movie', 'The book is always better than the movie.', 'movies', 'Always', 'Not always', 66, 14, 610, false],
  ['group-projects', 'Group projects should be optional.', 'campus', 'Optional', 'Keep them', 74, 9, 905, false],
  ['open-world', 'Are open-world games too big now?', 'games', 'Too big', 'More map!', 38, 17, 388, false],
  ['dh', 'Was the universal DH good for baseball?', 'sports', 'Good', 'Bad', 44, 18, 274, false],
  ['surprise-drops', 'Surprise album drops beat long rollouts.', 'music', 'Surprise!', 'Build hype', 50, 15, 333, false],
];

// name, likes, debates, streak
const PLAYERS: [string, number, number, number][] = [
  ['Maya', 4820, 132, 21],
  ['Priya', 4113, 98, 14],
  ['Leo', 3790, 141, 9],
  ['Jordan', 2954, 77, 12],
  ['Lena', 2610, 64, 5],
  ['Biplav', 2287, 88, 7],
  ['Ava', 1902, 51, 3],
  ['Omar', 1688, 59, 4],
  ['Kai', 1420, 45, 2],
  ['Zoe', 1206, 38, 6],
  ['Dev', 980, 31, 2],
  ['Rosa', 870, 29, 1],
  ['Sam', 640, 22, 1],
  ['Noah', 410, 15, 1],
];

type SeedConvo = {
  topic: string;
  a: string;
  b: string;
  likes: number;
  mode: 'casual' | 'comp';
  status?: 'live' | 'ended';
  scores?: [number, number];
  summary: string;
  messages: ['a' | 'b', string][];
};

const CONVOS: SeedConvo[] = [
  {
    topic: 'hotdog', a: 'Maya', b: 'Leo', likes: 482, mode: 'casual',
    summary: 'Maya says bread + filling = sandwich, case closed. Leo argues nobody orders “a sandwich” at a ballpark, so usage wins. Both agree ketchup is a separate crime.',
    messages: [
      ['a', "Bread on the outside, filling on the inside. That's literally the definition of a sandwich."],
      ['b', 'By that logic a taco is a sandwich. Are you prepared to defend that?'],
      ['a', 'A taco is one folded tortilla. A hot dog bun is hinged bread. Different shape, same family.'],
      ['b', 'Fair, but language is about how people use words. Nobody walks into a ballpark and orders “a sandwich.”'],
      ['a', "People also call every soda “Coke” in some places. Usage isn't always right."],
      ['b', "Okay that's a good point. Common ground: ketchup on a hot dog is the real debate."],
    ],
  },
  {
    topic: 'ai-coursework', a: 'Priya', b: 'Jordan', likes: 311, mode: 'comp', status: 'ended', scores: [88, 86],
    summary: 'Priya argues AI is a tool like a calculator and banning it just hides it. Jordan steelmanned her point, then argued exams must still test unaided thinking. Ended close: 88–86.',
    messages: [
      ['a', "Students will use AI at work. Teaching them to use it well beats pretending it doesn't exist."],
      ['b', 'If I steelman you: AI literacy is a real skill. Agreed. But a grade should measure what you can do.'],
      ['a', 'Then grade the process, not just the output — drafts, prompts, reflections.'],
      ['b', "That's more work for instructors, but I could live with that for some assignments."],
    ],
  },
  {
    topic: 'athletes', a: 'Dev', b: 'Rosa', likes: 156, mode: 'comp', status: 'live', scores: [54, 49],
    summary: 'Dev argues athletes generate the TV money and deserve a cut. Rosa worries schools would cut smaller sports to pay football players. Both picked up steelman bonuses.',
    messages: [
      ['a', 'Athletes bring in the TV deals. Paying them is just paying the people who do the work.'],
      ['b', "I get that, and it's fair for football. But most programs lose money — who funds the swim team then?"],
      ['a', 'Revenue sharing across sports, like pro leagues share TV money between teams.'],
    ],
  },
  {
    topic: 'remakes', a: 'Sam', b: 'Ava', likes: 205, mode: 'casual',
    summary: 'Sam thinks studios lean on remakes instead of new ideas. Ava points out some remakes introduced classics to a new generation. They argued over which counts as a “good” remake.',
    messages: [
      ['a', "Every summer it's another remake. Where are the original stories?"],
      ['b', 'Some remakes are how people my age found the originals at all.'],
      ['a', "Sure, but that's the exception, not the business model."],
    ],
  },
  {
    topic: 'hotdog', a: 'Noah', b: 'Zoe', likes: 97, mode: 'casual',
    summary: 'Noah used the “sub roll” argument. Zoe said a hot dog is its own category, like a taco or a burrito. Short but spicy.',
    messages: [
      ['a', 'A sub is a sandwich. A hot dog bun is a tiny sub roll. Checkmate.'],
      ['b', 'A hot dog is its own food category. Like tacos. Like burritos.'],
    ],
  },
  {
    topic: 'hotdog', a: 'Kai', b: 'Biplav', likes: 64, mode: 'comp', status: 'live', scores: [41, 44],
    summary: 'Kai leans on dictionary definitions; Biplav argues with menu data from local delis. The AI ref awarded both a steelman bonus.',
    messages: [
      ['a', 'Most dictionaries define a sandwich as filling between bread. A bun is bread.'],
      ['b', 'Every deli near campus lists hot dogs separately from sandwiches. Menus are usage data.'],
    ],
  },
  {
    topic: 'pineapple', a: 'Lena', b: 'Omar', likes: 377, mode: 'casual',
    summary: 'Lena: sweet + salty is a classic combo. Omar: it makes the crust soggy. The argument turned into a surprisingly detailed oven-temperature debate.',
    messages: [
      ['a', 'Sweet and salty is a classic pairing. Ham and pineapple just works.'],
      ['b', "It's the water content. Pineapple makes the middle soggy every time."],
    ],
  },
];

/** Made-up starting tallies for a demo topic. Shared by seed and removal so they cancel exactly. */
function seededVotes(total: number, aPct: number, ePct: number) {
  const aVotes = Math.round((total * aPct) / 100);
  const eVotes = Math.round((total * ePct) / 100);
  return { aVotes, bVotes: total - aVotes - eVotes, eVotes };
}

/** Demo player i (0-based) gets identity i + 1: tiny values no real (hash-derived) identity can have. */
const demoIdentity = (i: number) => new Identity(BigInt(i + 1));

export function seed(ctx: Ctx) {
  CATEGORIES.forEach((c, i) => ctx.db.category.insert({ ...c, sort: i }));

  // Demo players get small fixed identities, which can never collide with real
  // (hash-derived) ones.
  const players = new Map<string, Identity>();
  PLAYERS.forEach(([name, likes, debates, streak], i) => {
    const identity = demoIdentity(i);
    players.set(name, identity);
    ctx.db.username.insert({ name: name.toLowerCase(), owner: identity });
    ctx.db.player.insert({ identity, name, username: name.toLowerCase(), online: false, likes, debates, streak, lastActiveDay: 0, membership: 'Free' });
  });
  const system = Identity.zero();

  const now = ctx.timestamp.microsSinceUnixEpoch;
  const topics = new Map<string, bigint>();
  TOPICS.forEach(([key, title, cat, sideA, sideB, aPct, ePct, total, hot], i) => {
    const { aVotes, bVotes, eVotes } = seededVotes(total, aPct, ePct);
    const row = ctx.db.topic.insert({
      id: 0n,
      title,
      category: cat,
      sideA,
      sideB,
      aVotes,
      bVotes,
      eVotes,
      hot,
      createdBy: system,
      // Earlier entries in the list rank as slightly older.
      createdAt: new Timestamp(now - BigInt(TOPICS.length - i) * 60_000_000n),
    });
    topics.set(key, row.id);
  });

  CONVOS.forEach((cv, ci) => {
    const a = players.get(cv.a)!;
    const b = players.get(cv.b)!;
    const start = now - BigInt(CONVOS.length - ci) * 3_600_000_000n;
    const c = ctx.db.chat.insert({
      id: 0n,
      topicId: topics.get(cv.topic)!,
      mode: cv.mode,
      a,
      b,
      // Demo casual chats are finished examples (casual chats end 2 days after their first message).
      status: cv.status ?? (cv.mode === 'casual' ? 'ended' : 'live'),
      scoreA: cv.scores?.[0] ?? 0,
      scoreB: cv.scores?.[1] ?? 0,
      likes: cv.likes,
      msgCount: cv.messages.length,
      summary: cv.summary,
      phase: cv.mode === 'comp' ? (cv.status === 'ended' ? 'ended' : 'engagement') : 'casual',
      phaseStartedAt: new Timestamp(start),
      engagementStarter: 'a',
      currentTurn: cv.messages.length % 2 === 0 ? 'a' : 'b',
      remainingA: 300_000_000n,
      remainingB: 300_000_000n,
      openingA: true,
      openingB: true,
      closingA: false,
      closingB: false,
      yieldedSide: '',
      passesA: 0,
      passesB: 0,
      resultJson: '',
      createdAt: new Timestamp(start),
      lastAt: new Timestamp(start + BigInt(cv.messages.length) * 60_000_000n),
    });
    cv.messages.forEach(([side, text], mi) => {
      ctx.db.message.insert({
        id: 0n,
        chatId: c.id,
        sender: side === 'a' ? a : b,
        side,
        text,
        pts: undefined,
        why: undefined,
        phase: cv.mode === 'comp' ? 'engagement' : 'casual',
        sentAt: new Timestamp(start + BigInt(mi + 1) * 60_000_000n),
      });
    });
  });
}

/**
 * Removes the demo players, their usernames, their chats (with messages and
 * likes) and the made-up vote counts on the seeded topics. Real users never
 * chat with demo players, so nothing real is touched; real votes stay.
 * Returns false if the demo data was already removed.
 */
export function removeDemoData(ctx: Ctx): boolean {
  const demo = PLAYERS.map((_, i) => demoIdentity(i));
  if (!ctx.db.player.identity.find(demo[0])) return false;

  const isDemo = (id: Identity) => demo.some(d => d.isEqual(id));
  for (const c of [...ctx.db.chat.iter()]) {
    if (!isDemo(c.a) && !isDemo(c.b)) continue;
    for (const m of [...ctx.db.message.chatId.filter(c.id)]) ctx.db.message.id.delete(m.id);
    for (const l of [...ctx.db.chatLike.iter()]) if (l.chatId === c.id) ctx.db.chatLike.id.delete(l.id);
    ctx.db.chat.id.delete(c.id);
  }
  for (const id of demo) {
    const p = ctx.db.player.identity.find(id);
    if (p) ctx.db.username.name.delete(p.username);
    ctx.db.player.identity.delete(id);
  }

  const system = Identity.zero();
  for (const [, title, , , , aPct, ePct, total] of TOPICS) {
    const tp = [...ctx.db.topic.iter()].find(t => t.title === title && t.createdBy.isEqual(system));
    if (!tp) continue;
    const seeded = seededVotes(total, aPct, ePct);
    ctx.db.topic.id.update({
      ...tp,
      aVotes: Math.max(0, tp.aVotes - seeded.aVotes),
      bVotes: Math.max(0, tp.bVotes - seeded.bVotes),
      eVotes: Math.max(0, tp.eVotes - seeded.eVotes),
    });
  }
  return true;
}
