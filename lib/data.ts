/**
 * Mock data for the demo. Swap these for Spacetime queries later.
 * Feed ranking would come from the backend (popularity + your preferences +
 * view history); here each topic just carries a `reason` to show why it's in your feed.
 */

export type Mode = "casual" | "comp";
export type Side = "a" | "b";
/** What you can pick on a poll: one of the two sides, or "either". */
export type Choice = Side | "either";
/** Only challenge (comp) chats have a live/ended state. Casual chats are just chats. */
export type CompStatus = "live" | "ended";

export type Topic = {
  id: string;
  title: string;
  category: string; // category slug
  sideA: string;
  sideB: string;
  aPct: number; // % who picked side A
  ePct: number; // % who picked "Either"
  players: number;
  reason?: string; // why the feed ranked it for you
  hot?: boolean;
};

export const bPct = (t: Pick<Topic, "aPct" | "ePct">) => 100 - t.aPct - t.ePct;
export const sideLabel = (t: Pick<Topic, "sideA" | "sideB">, s: Side) => (s === "a" ? t.sideA : t.sideB);
export const otherSide = (s: Side): Side => (s === "a" ? "b" : "a");

export type ChatMessage = { side: Side; text: string };

/** A conversation between two other people (what spectators browse). */
export type Convo = {
  id: string;
  topicId: string;
  a: string; // user on side A
  b: string; // user on side B
  summary: string;
  likes: number;
  mode: Mode;
  status?: CompStatus; // comp only
  scores?: { a: number; b: number }; // comp only
  messages: ChatMessage[];
};

/** A conversation YOU are in (the typing view). */
export type MyMsg = { from: "me" | "them"; text: string; pts?: number; why?: string };
export type MyChat = {
  id: string;
  topic: Pick<Topic, "id" | "title" | "sideA" | "sideB">;
  opponent: string;
  mySide: Side;
  mode: Mode;
  status?: CompStatus; // comp only
  scores?: { me: number; them: number }; // comp only
  turn: "me" | "them";
  messages: MyMsg[];
};

export type IconName = "flame" | "ball" | "music" | "film" | "food" | "chip" | "cap" | "game";
export type Category = { slug: string; name: string; color: string; icon: IconName; blurb: string };

export const CATEGORIES: Category[] = [
  { slug: "trending", name: "Trending", color: "#FFD43B", icon: "flame", blurb: "What everyone's arguing about" },
  { slug: "sports", name: "Sports", color: "#7EE0B5", icon: "ball", blurb: "Hot takes from the bleachers" },
  { slug: "music", name: "Music", color: "#FF8FB1", icon: "music", blurb: "Your playlist is a hill to die on" },
  { slug: "movies", name: "Movies", color: "#8EA2FF", icon: "film", blurb: "Spoilers argued responsibly" },
  { slug: "food", name: "Food", color: "#FFB27A", icon: "food", blurb: "The most serious category" },
  { slug: "tech", name: "Tech", color: "#B9A6FF", icon: "chip", blurb: "AI, apps and the internet" },
  { slug: "campus", name: "Campus", color: "#9BE7F0", icon: "cap", blurb: "Dorms, classes, club drama" },
  { slug: "games", name: "Games", color: "#C8F27A", icon: "game", blurb: "GG, no re" },
];

export const TOPICS: Topic[] = [
  { id: "hotdog", title: "Is a hot dog a sandwich?", category: "food", sideA: "Sandwich", sideB: "Not a sandwich", aPct: 48, ePct: 12, players: 1832, reason: "Because you liked Food debates", hot: true },
  { id: "ai-coursework", title: "Should universities allow AI tools on graded coursework?", category: "tech", sideA: "Allow it", sideB: "Ban it", aPct: 60, ePct: 14, players: 1204, reason: "Popular at your campus" },
  { id: "remakes", title: "Are movie remakes ruining cinema?", category: "movies", sideA: "Yes, stop", sideB: "Remakes rule", aPct: 36, ePct: 16, players: 966, reason: "You watched 3 Movies chats" },
  { id: "athletes", title: "Should college athletes be paid like employees?", category: "sports", sideA: "Pay them", sideB: "Keep it amateur", aPct: 55, ePct: 13, players: 742, hot: true },
  { id: "vinyl", title: "Does vinyl actually sound better than streaming?", category: "music", sideA: "Vinyl", sideB: "Streaming", aPct: 33, ePct: 18, players: 455, reason: "New in Music" },
  { id: "age-verify", title: "Should social media verify every user's age?", category: "tech", sideA: "Verify", sideB: "Don't", aPct: 62, ePct: 12, players: 1530, hot: true },
  { id: "pineapple", title: "Pineapple belongs on pizza.", category: "food", sideA: "Belongs", sideB: "Crime", aPct: 41, ePct: 15, players: 2210, hot: true },
  { id: "book-movie", title: "The book is always better than the movie.", category: "movies", sideA: "Always", sideB: "Not always", aPct: 66, ePct: 14, players: 610 },
  { id: "group-projects", title: "Group projects should be optional.", category: "campus", sideA: "Optional", sideB: "Keep them", aPct: 74, ePct: 9, players: 905, reason: "Trending on campus" },
  { id: "open-world", title: "Are open-world games too big now?", category: "games", sideA: "Too big", sideB: "More map!", aPct: 38, ePct: 17, players: 388 },
  { id: "dh", title: "Was the universal DH good for baseball?", category: "sports", sideA: "Good", sideB: "Bad", aPct: 44, ePct: 18, players: 274 },
  { id: "surprise-drops", title: "Surprise album drops beat long rollouts.", category: "music", sideA: "Surprise!", sideB: "Build hype", aPct: 50, ePct: 15, players: 333 },
];

export const topicById = (id: string) => TOPICS.find((t) => t.id === id);

export const CONVOS: Convo[] = [
  {
    id: "c1", topicId: "hotdog", a: "Maya", b: "Leo", likes: 482, mode: "casual",
    summary: "Maya says bread + filling = sandwich, case closed. Leo argues nobody orders “a sandwich” at a ballpark, so usage wins. Both agree ketchup is a separate crime.",
    messages: [
      { side: "a", text: "Bread on the outside, filling on the inside. That's literally the definition of a sandwich." },
      { side: "b", text: "By that logic a taco is a sandwich. Are you prepared to defend that?" },
      { side: "a", text: "A taco is one folded tortilla. A hot dog bun is hinged bread. Different shape, same family." },
      { side: "b", text: "Fair, but language is about how people use words. Nobody walks into a ballpark and orders “a sandwich.”" },
      { side: "a", text: "People also call every soda “Coke” in some places. Usage isn't always right." },
      { side: "b", text: "Okay that's a good point. Common ground: ketchup on a hot dog is the real debate." },
    ],
  },
  {
    id: "c2", topicId: "ai-coursework", a: "Priya", b: "Jordan", likes: 311, mode: "comp", status: "ended", scores: { a: 88, b: 86 },
    summary: "Priya argues AI is a tool like a calculator and banning it just hides it. Jordan steelmanned her point, then argued exams must still test unaided thinking. Ended close: 88–86.",
    messages: [
      { side: "a", text: "Students will use AI at work. Teaching them to use it well beats pretending it doesn't exist." },
      { side: "b", text: "If I steelman you: AI literacy is a real skill. Agreed. But a grade should measure what you can do." },
      { side: "a", text: "Then grade the process, not just the output — drafts, prompts, reflections." },
      { side: "b", text: "That's more work for instructors, but I could live with that for some assignments." },
    ],
  },
  {
    id: "c7", topicId: "athletes", a: "Dev", b: "Rosa", likes: 156, mode: "comp", status: "live", scores: { a: 54, b: 49 },
    summary: "Dev argues athletes generate the TV money and deserve a cut. Rosa worries schools would cut smaller sports to pay football players. Both picked up steelman bonuses.",
    messages: [
      { side: "a", text: "Athletes bring in the TV deals. Paying them is just paying the people who do the work." },
      { side: "b", text: "I get that, and it's fair for football. But most programs lose money — who funds the swim team then?" },
      { side: "a", text: "Revenue sharing across sports, like pro leagues share TV money between teams." },
    ],
  },
  {
    id: "c3", topicId: "remakes", a: "Sam", b: "Ava", likes: 205, mode: "casual",
    summary: "Sam thinks studios lean on remakes instead of new ideas. Ava points out some remakes introduced classics to a new generation. They argued over which counts as a “good” remake.",
    messages: [
      { side: "a", text: "Every summer it's another remake. Where are the original stories?" },
      { side: "b", text: "Some remakes are how people my age found the originals at all." },
      { side: "a", text: "Sure, but that's the exception, not the business model." },
    ],
  },
  {
    id: "c4", topicId: "hotdog", a: "Noah", b: "Zoe", likes: 97, mode: "casual",
    summary: "Noah used the “sub roll” argument. Zoe said a hot dog is its own category, like a taco or a burrito. Short but spicy.",
    messages: [
      { side: "a", text: "A sub is a sandwich. A hot dog bun is a tiny sub roll. Checkmate." },
      { side: "b", text: "A hot dog is its own food category. Like tacos. Like burritos." },
    ],
  },
  {
    id: "c5", topicId: "hotdog", a: "Kai", b: "Biplav", likes: 64, mode: "comp", status: "live", scores: { a: 41, b: 44 },
    summary: "Kai leans on dictionary definitions; Biplav argues with menu data from local delis. The AI ref awarded both a steelman bonus.",
    messages: [
      { side: "a", text: "Most dictionaries define a sandwich as filling between bread. A bun is bread." },
      { side: "b", text: "Every deli near campus lists hot dogs separately from sandwiches. Menus are usage data." },
    ],
  },
  {
    id: "c6", topicId: "pineapple", a: "Lena", b: "Omar", likes: 377, mode: "casual",
    summary: "Lena: sweet + salty is a classic combo. Omar: it makes the crust soggy. The argument turned into a surprisingly detailed oven-temperature debate.",
    messages: [
      { side: "a", text: "Sweet and salty is a classic pairing. Ham and pineapple just works." },
      { side: "b", text: "It's the water content. Pineapple makes the middle soggy every time." },
    ],
  },
];

export const convoById = (id: string) => CONVOS.find((c) => c.id === id);
export const convosForTopic = (id: string) => CONVOS.filter((c) => c.topicId === id);

const T = (id: string) => {
  const t = topicById(id)!;
  return { id: t.id, title: t.title, sideA: t.sideA, sideB: t.sideB };
};

/** Chats you're part of (shown in My Chats, opened in /chat/[id]). */
export const MY_CHATS: MyChat[] = [
  {
    id: "m3", topic: T("athletes"), opponent: "Kai", mySide: "a", mode: "comp", status: "live", scores: { me: 34, them: 29 }, turn: "me",
    messages: [
      { from: "me", text: "College sports bring in huge TV money, and the athletes doing the work see almost none of it.", pts: 9, why: "Reasoning" },
      { from: "them", text: "Fair point on the TV money. But most programs lose money — who pays for the swim team?", pts: 11, why: "Steelman" },
      { from: "me", text: "Revenue sharing from the sports that do make money, like pro leagues share TV deals.", pts: 8, why: "Example" },
      { from: "them", text: "Decent model, but it assumes schools won't just cut smaller sports instead.", pts: 6, why: "Reasoning" },
    ],
  },
  {
    id: "m1", topic: T("hotdog"), opponent: "Leo", mySide: "a", mode: "casual", turn: "me",
    messages: [
      { from: "me", text: "Bread, filling, bread. I rest my case." },
      { from: "them", text: "So a taco is a sandwich now? Bold." },
      { from: "me", text: "A taco is one folded tortilla. A bun is hinged bread. Totally different." },
      { from: "them", text: "Okay but nobody at a ballpark says “one sandwich please.”" },
    ],
  },
  {
    id: "m2", topic: T("ai-coursework"), opponent: "Jordan", mySide: "a", mode: "comp", status: "ended", scores: { me: 88, them: 86 }, turn: "them",
    messages: [
      { from: "me", text: "Students will use AI at work. Teaching them to use it well beats pretending it doesn't exist.", pts: 12, why: "Reasoning" },
      { from: "them", text: "Steelmanning you: AI literacy is a real skill. But a grade should measure what you can do alone.", pts: 14, why: "Steelman" },
      { from: "me", text: "Then grade the process — drafts, prompts, reflections — not just the final output.", pts: 13, why: "Common ground" },
      { from: "them", text: "More work for instructors, but I could live with that for some assignments. GG!", pts: 9, why: "Common ground" },
    ],
  },
  {
    id: "m4", topic: T("pineapple"), opponent: "Omar", mySide: "a", mode: "casual", turn: "them",
    messages: [
      { from: "me", text: "Sweet and salty is a classic. Pineapple and ham just works." },
      { from: "them", text: "Until the middle of the pizza turns into soup." },
      { from: "me", text: "That's an oven problem, not a pineapple problem." },
    ],
  },
  {
    id: "m5", topic: T("remakes"), opponent: "Ava", mySide: "b", mode: "casual", turn: "me",
    messages: [
      { from: "them", text: "Every summer it's another remake. Where are the original stories?" },
      { from: "me", text: "Some remakes are how people our age found the originals at all." },
      { from: "them", text: "Name one remake that was better than the original." },
    ],
  },
];

export const ME = { name: "Zhan", handle: "@zhan", likes: 252, membership: "Free" as "Free" | "Coach+" };

export const LEADERS = [
  { name: "Maya", likes: 4820, debates: 132, streak: 21 },
  { name: "Priya", likes: 4113, debates: 98, streak: 14 },
  { name: "Leo", likes: 3790, debates: 141, streak: 9 },
  { name: "Jordan", likes: 2954, debates: 77, streak: 12 },
  { name: "Lena", likes: 2610, debates: 64, streak: 5 },
  { name: "Biplav", likes: 2287, debates: 88, streak: 7 },
  { name: "Ava", likes: 1902, debates: 51, streak: 3 },
  { name: "Omar", likes: 1688, debates: 59, streak: 4 },
  { name: "Kai", likes: 1420, debates: 45, streak: 2 },
  { name: "Zoe", likes: 1206, debates: 38, streak: 6 },
];
export const MY_RANK = { rank: 23, name: "Zhan", likes: 252, debates: 18, streak: 3 };

export const categoryBySlug = (slug: string) => CATEGORIES.find((c) => c.slug === slug);
export const topicsForCategory = (slug: string) =>
  slug === "trending"
    ? [...TOPICS].sort((x, y) => y.players - x.players).slice(0, 8)
    : TOPICS.filter((t) => t.category === slug).sort((x, y) => y.players - x.players);
