/**
 * UI-facing types + small helpers. The data itself lives in SpacetimeDB and is
 * mapped into these shapes by lib/store.tsx.
 */

export type Mode = "casual" | "comp";
export type Side = "a" | "b";
/** What you can pick on a poll: one of the two sides, or "either". */
export type Choice = Side | "either";
/** Live / ended. Comp debates end after judging; casual chats end 2 days after their first message. */
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
  mine?: boolean; // you created it
  createdAt: number; // ms since epoch
};

export const bPct = (t: Pick<Topic, "aPct" | "ePct">) => 100 - t.aPct - t.ePct;
export const sideLabel = (t: Pick<Topic, "sideA" | "sideB">, s: Side) => (s === "a" ? t.sideA : t.sideB);
export const otherSide = (s: Side): Side => (s === "a" ? "b" : "a");

export type ChatMessage = { id: string; side: Side; text: string };

/** A conversation between two other people (what spectators browse). */
export type Convo = {
  id: string;
  topicId: string;
  a: string; // user on side A
  b: string; // user on side B
  summary: string;
  likes: number;
  mode: Mode;
  status?: CompStatus;
  scores?: { a: number; b: number }; // comp only: points so far
  /** Comp only: every point award, both sides (the breakdown behind the score bar). */
  awards?: PointAward[];
  /** Comp only, once ended and fully scored: winner by points + AI feedback. */
  result?: CompResult;
  messages: ChatMessage[];
  lastAt: number;
  /** You're one of the two players (spectator ranking leaves these out). */
  mine?: boolean;
  /** A comp debate with a finished judging result. */
  hasResult?: boolean;
  /** Why the View yaaps feed shows it (set by rankConvos). */
  reason?: string;
};

/** A conversation YOU are in (the typing view). */
export type MyMsg = { id: string; from: "me" | "them"; text: string };

/** One comp point award: which side, how many points, why, and the message that earned it. */
export type PointAward = { id: string; side: Side; points: number; reason: string; messageId: string; quote: string };
/** Final comp result: decided by points; feedback written by the AI once the chat ends. */
export type CompResult = {
  winner: Side | "tie";
  /** Set when a player yielded (conceded): they lose whatever the points. */
  conceded?: Side;
  scores: { a: number; b: number };
  feedback: { a: string; b: string };
};
export type MyChat = {
  id: string;
  topic: Pick<Topic, "id" | "title" | "sideA" | "sideB">;
  opponent: string;
  mySide: Side;
  mode: Mode;
  status?: CompStatus;
  scores?: { me: number; them: number }; // comp only: points so far
  awards?: PointAward[]; // comp only
  result?: CompResult; // comp only, once final
  /** Comp only: how many messages the AI has scored so far (it scores in batches of 6). */
  scoredCount?: number;
  turn: "me" | "them";
  messages: MyMsg[];
  createdAt: number;
  lastAt: number;
};

export type IconName = "flame" | "ball" | "music" | "film" | "food" | "chip" | "cap" | "game";
export type Category = { slug: string; name: string; color: string; icon: IconName; blurb: string };

export type Leader = { id: string; name: string; likes: number; debates: number; streak: number; you: boolean };

/** Most-played first; "trending" is the top 8 across all categories. */
export function topicsForCategory(topics: Topic[], slug: string) {
  const byPlayers = (x: Topic, y: Topic) => y.players - x.players;
  return slug === "trending" ? [...topics].sort(byPlayers).slice(0, 8) : topics.filter((t) => t.category === slug).sort(byPlayers);
}
