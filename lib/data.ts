/**
 * UI-facing types + small helpers. The data itself lives in SpacetimeDB and is
 * mapped into these shapes by lib/store.tsx.
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
  status?: CompStatus; // comp only
  scores?: { a: number; b: number }; // comp only
  messages: ChatMessage[];
  lastAt: number;
};

/** A conversation YOU are in (the typing view). */
export type MyMsg = { id: string; from: "me" | "them"; text: string; pts?: number; why?: string };
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
