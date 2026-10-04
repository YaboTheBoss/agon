"use client";

/**
 * SpacetimeDB connection + live data for the whole app.
 *
 * Everything is subscribed once at the root and mapped into the UI shapes from
 * lib/data.ts, so pages just call useStore(). Tables are small for now; once
 * they grow, narrow the subscriptions (e.g. messages per chat) with
 * tables.x.where(...).
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { SpacetimeDBProvider, useReducer, useSpacetimeDB, useTable } from "spacetimedb/react";
import type { Identity } from "spacetimedb";
import { DbConnection, reducers, tables } from "@/lib/module_bindings";
import { tokenExpired, useAuth } from "@/lib/auth";
import type { Category, Choice, Convo, IconName, Leader, Mode, MyChat, Side, Topic } from "@/lib/data";

export type QueuedTicket = { id: string; topicId: string; title: string; choice: Choice; mode: Mode; since: number };
export type PairNotification = { id: string; chatId: string; title: string; text: string; at: number };

const URI = process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "ws://localhost:3010";
const DB_NAME = process.env.NEXT_PUBLIC_SPACETIMEDB_DB ?? "yaapi-dev";

/* ---------------- connection ---------------- */

/**
 * Connects with the Google ID token when signed in, otherwise anonymously
 * (browse-only — the server gives anonymous visitors no player row).
 * Must sit under <AuthProvider>, which settles the token before we connect.
 */
export function SpacetimeProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const builder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(URI)
        .withDatabaseName(DB_NAME)
        .withToken(token)
        .onConnectError((_ctx, err) => {
          console.error("SpacetimeDB connect error", err);
          // An hour-old Google token can't reconnect; reloading lets AuthProvider refresh it.
          if (token && tokenExpired(token)) window.location.reload();
        }),
    [token]
  );
  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      <DataProvider>{children}</DataProvider>
    </SpacetimeDBProvider>
  );
}

/* ---------------- helpers ---------------- */

const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n);
const same = (a: Identity | undefined, b: Identity | undefined) => !!a && !!b && a.isEqual(b);
const pct = (n: number, total: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

/* ---------------- data ---------------- */

type Store = ReturnType<typeof useBuildStore>;
const StoreContext = createContext<Store | null>(null);

function DataProvider({ children }: { children: ReactNode }) {
  const store = useBuildStore();
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore must be used under <SpacetimeProvider>");
  return s;
}

function useBuildStore() {
  const { identity, isActive, connectionError } = useSpacetimeDB();

  const [playerRows, playersReady] = useTable(tables.player);
  const [categoryRows, categoriesReady] = useTable(tables.category);
  const [topicRows, topicsReady] = useTable(tables.topic);
  const [chatRows, chatsReady] = useTable(tables.chat);
  const [messageRows, messagesReady] = useTable(tables.message);
  const [likeRows] = useTable(tables.chatLike);
  const [voteRows] = useTable(tables.vote);
  const [ticketRows] = useTable(tables.ticket);
  const [notificationRows] = useTable(tables.notification);
  const [usernameRows] = useTable(tables.username);

  const ready = playersReady && categoriesReady && topicsReady && chatsReady && messagesReady;

  const joinQueue = useReducer(reducers.joinQueue);
  const leaveQueue = useReducer(reducers.leaveQueue);
  const dismissNotifications = useReducer(reducers.dismissNotifications);
  const sendMessage = useReducer(reducers.sendMessage);
  const toggleLike = useReducer(reducers.toggleLike);
  const createTopic = useReducer(reducers.createTopic);
  const setName = useReducer(reducers.setName);
  const completeProfile = useReducer(reducers.completeProfile);

  const derived = useMemo(() => {
    const playerByHex = new Map(playerRows.map((p) => [p.identity.toHexString(), p]));
    const nameOf = (id: Identity) => playerByHex.get(id.toHexString())?.name ?? "Someone";
    const me = identity ? playerByHex.get(identity.toHexString()) : undefined;

    const categories: Category[] = [...categoryRows]
      .sort((x, y) => x.sort - y.sort)
      .map((c) => ({ slug: c.slug, name: c.name, color: c.color, icon: c.icon as IconName, blurb: c.blurb }));
    const catName = new Map(categories.map((c) => [c.slug, c.name]));

    const messagesByChat = new Map<bigint, typeof messageRows[number][]>();
    for (const m of messageRows) {
      const list = messagesByChat.get(m.chatId) ?? [];
      list.push(m);
      messagesByChat.set(m.chatId, list);
    }
    for (const list of messagesByChat.values()) {
      list.sort((x, y) => (x.sentAt.microsSinceUnixEpoch === y.sentAt.microsSinceUnixEpoch ? Number(x.id - y.id) : x.sentAt.microsSinceUnixEpoch < y.sentAt.microsSinceUnixEpoch ? -1 : 1));
    }

    const mine = chatRows.filter((c) => same(c.a, identity) || same(c.b, identity));
    const myCategories = new Set(mine.map((c) => topicRows.find((t) => t.id === c.topicId)?.category));

    // Feed ranking: your fresh topics first, then hot, then most played.
    // "Fresh" is measured against the newest topic so ranking stays a pure function of the data.
    const DAY = 86_400_000;
    const now = Math.max(0, ...topicRows.map((t) => ms(t.createdAt)));
    const topics: Topic[] = topicRows
      .map((t) => {
        const players = t.aVotes + t.bVotes + t.eVotes;
        const yours = same(t.createdBy, identity);
        return {
          id: t.id.toString(),
          title: t.title,
          category: t.category,
          sideA: t.sideA,
          sideB: t.sideB,
          aPct: players ? pct(t.aVotes, players) : 40,
          ePct: players ? pct(t.eVotes, players) : 20,
          players,
          hot: t.hot,
          mine: yours,
          createdAt: ms(t.createdAt),
          reason: yours
            ? "You created this"
            : myCategories.has(t.category)
              ? `Because you chat about ${catName.get(t.category) ?? t.category}`
              : undefined,
        };
      })
      .sort((x, y) => {
        const fx = x.mine && now - x.createdAt < DAY ? 1 : 0;
        const fy = y.mine && now - y.createdAt < DAY ? 1 : 0;
        if (fx !== fy) return fy - fx;
        if (fx) return y.createdAt - x.createdAt;
        if (!!x.hot !== !!y.hot) return x.hot ? -1 : 1;
        return y.players - x.players;
      });
    const topicById = new Map(topics.map((t) => [t.id, t]));

    const convos: Convo[] = chatRows
      .filter((c) => c.msgCount > 0)
      .map((c) => ({
        id: c.id.toString(),
        topicId: c.topicId.toString(),
        a: nameOf(c.a),
        b: nameOf(c.b),
        summary: c.summary,
        likes: c.likes,
        mode: c.mode as Mode,
        status: c.mode === "comp" ? (c.status as "live" | "ended") : undefined,
        scores: c.mode === "comp" ? { a: c.scoreA, b: c.scoreB } : undefined,
        messages: (messagesByChat.get(c.id) ?? []).map((m) => ({ id: m.id.toString(), side: m.side as Side, text: m.text })),
        lastAt: ms(c.lastAt),
      }))
      .sort((x, y) => y.likes - x.likes);

    const myChats: MyChat[] = mine
      .map((c) => {
        const mySide: Side = same(c.a, identity) ? "a" : "b";
        const oppId = mySide === "a" ? c.b : c.a;
        const t = topicById.get(c.topicId.toString());
        const msgs = messagesByChat.get(c.id) ?? [];
        const last = msgs.at(-1);
        return {
          id: c.id.toString(),
          topic: { id: c.topicId.toString(), title: t?.title ?? "Unknown topic", sideA: t?.sideA ?? "Yes", sideB: t?.sideB ?? "No" },
          opponent: nameOf(oppId),
          mySide,
          mode: c.mode as Mode,
          status: c.mode === "comp" ? (c.status as "live" | "ended") : undefined,
          scores: c.mode === "comp" ? { me: mySide === "a" ? c.scoreA : c.scoreB, them: mySide === "a" ? c.scoreB : c.scoreA } : undefined,
          turn: last && same(last.sender, identity) ? ("them" as const) : ("me" as const),
          messages: msgs.map((m) => ({
            id: m.id.toString(),
            from: same(m.sender, identity) ? ("me" as const) : ("them" as const),
            text: m.text,
            pts: m.pts,
            why: m.why,
          })),
          createdAt: ms(c.createdAt),
          lastAt: ms(c.lastAt),
        };
      })
      .sort((x, y) => y.lastAt - x.lastAt);

    const leaders: Leader[] = playerRows
      .map((p) => ({ id: p.identity.toHexString(), name: p.name, likes: p.likes, debates: p.debates, streak: p.streak, you: same(p.identity, identity) }))
      .sort((x, y) => y.likes - x.likes);

    const likedChatIds = new Set(likeRows.filter((l) => same(l.liker, identity)).map((l) => l.chatId.toString()));
    const myVotes = new Map(voteRows.filter((v) => same(v.voter, identity)).map((v) => [v.topicId.toString(), v.choice]));
    const myTickets: QueuedTicket[] = ticketRows
      .filter((tk) => same(tk.identity, identity))
      .map((tk) => ({
        id: tk.id.toString(),
        topicId: tk.topicId.toString(),
        title: topicById.get(tk.topicId.toString())?.title ?? "Unknown topic",
        choice: tk.choice as Choice,
        mode: tk.mode as Mode,
        since: ms(tk.createdAt),
      }))
      .sort((x, y) => y.since - x.since);

    // The server only sends us our own notifications; filter anyway in case that changes.
    const notifications: PairNotification[] = notificationRows
      .filter((n) => same(n.recipient, identity))
      .map((n) => ({
        id: n.id.toString(),
        chatId: n.chatId.toString(),
        title: topicById.get(n.topicId.toString())?.title ?? "",
        text: n.text,
        at: ms(n.createdAt),
      }))
      .sort((x, y) => y.at - x.at);

    return { me, categories, topics, topicById, convos, myChats, leaders, likedChatIds, myVotes, myTickets, notifications, nameOf };
  }, [identity, playerRows, categoryRows, topicRows, chatRows, messageRows, likeRows, voteRows, ticketRows, notificationRows]);

  // Stable identity so effects can depend on it without re-running every update.
  const actions = useMemo(
    () => ({
      joinQueue: (topicId: string, choice: string, mode: Mode) => joinQueue({ topicId: BigInt(topicId), choice, mode }),
      leaveQueue: (ticketId: string) => leaveQueue({ ticketId: BigInt(ticketId) }),
      dismissNotifications: (chatId: string) => dismissNotifications({ chatId: BigInt(chatId) }),
      sendMessage: (chatId: string, text: string) => sendMessage({ chatId: BigInt(chatId), text }),
      toggleLike: (chatId: string) => toggleLike({ chatId: BigInt(chatId) }),
      createTopic: (args: { title: string; sideA: string; sideB: string; category: string }) => createTopic(args),
      setName: (name: string) => setName({ name }),
      completeProfile: (username: string, displayName: string) => completeProfile({ username, displayName }),
    }),
    [joinQueue, leaveQueue, dismissNotifications, sendMessage, toggleLike, createTopic, setName, completeProfile]
  );

  return {
    ready,
    connected: isActive,
    connectionError,
    identity,
    ...derived,
    /** Signed in with Google but hasn't picked a username yet. */
    needsProfile: !!derived.me && !derived.me.username,
    usernameTaken: (handle: string) => usernameRows.some((u) => u.name === handle.toLowerCase()),
    convoById: (id: string) => derived.convos.find((c) => c.id === id),
    myChatById: (id: string) => derived.myChats.find((c) => c.id === id),
    categoryBySlug: (slug: string) => derived.categories.find((c) => c.slug === slug),
    convosForTopic: (topicId: string) => derived.convos.filter((c) => c.topicId === topicId),
    actions,
  };
}
