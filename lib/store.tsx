"use client";

/**
 * SpacetimeDB connection + live data for the whole app.
 *
 * Everything is subscribed once at the root and mapped into the UI shapes from
 * lib/data.ts, so pages just call useStore(). Tables are small for now; once
 * they grow, narrow the subscriptions (e.g. messages per chat) with
 * tables.x.where(...).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SpacetimeDBProvider, useReducer, useSpacetimeDB, useTable } from "spacetimedb/react";
import type { Identity } from "spacetimedb";
import { DbConnection, reducers, tables } from "@/lib/module_bindings";
import { tokenExpired, useAuth } from "@/lib/auth";
import type { Category, Choice, Convo, IconName, Leader, Mode, MyChat, Side, Topic } from "@/lib/data";
import { decayScore, rankConvos, rankFeed, type ConvoMemoryRow, type FeedEntity, type FeedInputs, type MemoryRow } from "@/lib/recommend";

export type QueuedTicket = { id: string; topicId: string; title: string; choice: Choice; mode: Mode; since: number };
export type PairNotification = { id: string; chatId: string; title: string; text: string; at: number };
export type TagOption = { slug: string; name: string };

const IMPRESSION_FLUSH_MS = 5_000;

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
const panelVotes = (json: string): { a: number; b: number } | undefined => {
  if (!json) return undefined;
  try {
    const counts = JSON.parse(json)?.panel?.voteCounts;
    return typeof counts?.player_a === "number" && typeof counts?.player_b === "number"
      ? { a: counts.player_a, b: counts.player_b }
      : undefined;
  } catch {
    return undefined;
  }
};

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
  // Feed recommendations: topic features (public) + this player's own profile rows.
  const [tagRows, tagsReady] = useTable(tables.tag);
  const [topicTagRows, topicTagsReady] = useTable(tables.topicTag);
  const [topicMetaRows] = useTable(tables.topicMeta);
  const [entityRows] = useTable(tables.entity);
  const [topicEntityRows, topicEntitiesReady] = useTable(tables.topicEntity);
  const [affinityRows, affinityReady] = useTable(tables.affinity);
  const [memoryRows, memoryReady] = useTable(tables.topicMemory);
  const [convoMemoryRows, convoMemoryReady] = useTable(tables.convoMemory);
  const [chatStatsRows, chatStatsReady] = useTable(tables.chatStats);

  const ready = playersReady && categoriesReady && topicsReady && chatsReady && messagesReady;

  const joinQueue = useReducer(reducers.joinQueue);
  const leaveQueue = useReducer(reducers.leaveQueue);
  const dismissNotifications = useReducer(reducers.dismissNotifications);
  const sendMessage = useReducer(reducers.sendMessage);
  const toggleLike = useReducer(reducers.toggleLike);
  const createTopic = useReducer(reducers.createTopic);
  const setName = useReducer(reducers.setName);
  const completeProfile = useReducer(reducers.completeProfile);
  const advanceMatch = useReducer(reducers.advanceMatch);
  const passTurn = useReducer(reducers.passTurn);
  const yieldEngagement = useReducer(reducers.yieldEngagement);
  const submitJudgingResult = useReducer(reducers.submitJudgingResult);
  const trackEvent = useReducer(reducers.trackEvent);
  const trackImpressions = useReducer(reducers.trackImpressions);
  const setInterests = useReducer(reducers.setInterests);
  const trackConvoEvent = useReducer(reducers.trackConvoEvent);
  const trackConvoImpressions = useReducer(reducers.trackConvoImpressions);

  // Wall clock for decay, freshness and liveness (never read during render).
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    // 15 s: precise enough for "live casual chats must have a message in the last minute".
    const every = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);

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

    // Default order for lists (search, categories): your fresh topics first, then hot, then most played.
    // The feed itself is personalised separately (`feed`, below).
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
        status: c.status as "live" | "ended",
        scores: c.mode === "comp" ? (panelVotes(c.resultJson) ?? { a: 0, b: 0 }) : undefined,
        messages: (messagesByChat.get(c.id) ?? []).map((m) => ({ id: m.id.toString(), side: m.side as Side, text: m.text })),
        lastAt: ms(c.lastAt),
        mine: same(c.a, identity) || same(c.b, identity),
        hasResult: c.mode === "comp" && !!c.resultJson,
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
          status: c.status as "live" | "ended",
          scores: c.mode === "comp" ? (() => {
            const votes = panelVotes(c.resultJson) ?? { a: 0, b: 0 };
            return { me: mySide === "a" ? votes.a : votes.b, them: mySide === "a" ? votes.b : votes.a };
          })() : undefined,
          turn: c.mode === "comp"
            ? (c.currentTurn === mySide ? ("me" as const) : ("them" as const))
            : (last && same(last.sender, identity) ? ("them" as const) : ("me" as const)),
          phase: c.mode === "comp" ? (c.phase as MyChat["phase"]) : undefined,
          phaseStartedAt: c.mode === "comp" ? ms(c.phaseStartedAt) : undefined,
          engagementStarter: c.mode === "comp" ? (c.engagementStarter as Side) : undefined,
          remaining: c.mode === "comp" ? {
            me: Number(mySide === "a" ? c.remainingA : c.remainingB) / 1000,
            them: Number(mySide === "a" ? c.remainingB : c.remainingA) / 1000,
          } : undefined,
          submitted: c.mode === "comp" ? {
            me: c.phase === "opening" ? (mySide === "a" ? c.openingA : c.openingB) : (mySide === "a" ? c.closingA : c.closingB),
            them: c.phase === "opening" ? (mySide === "a" ? c.openingB : c.openingA) : (mySide === "a" ? c.closingB : c.closingA),
          } : undefined,
          yieldedSide: c.yieldedSide ? (c.yieldedSide as Side) : undefined,
          resultJson: c.resultJson || undefined,
          messages: msgs.map((m) => ({
            id: m.id.toString(),
            from: same(m.sender, identity) ? ("me" as const) : ("them" as const),
            text: m.text,
            pts: m.pts,
            phase: m.phase,
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

  // Personalised feed order (lib/recommend.ts). Recomputed as data changes; the feed
  // page snapshots it on open so cards don't jump around while you scroll.
  const tags: TagOption[] = useMemo(() => [...tagRows].sort((x, y) => x.sort - y.sort).map((t) => ({ slug: t.slug, name: t.name })), [tagRows]);
  const feedInputs: FeedInputs = useMemo(() => {
    const at = now || Math.max(0, ...derived.topics.map((t) => t.createdAt));
    const group = <T,>(rows: readonly T[], key: (r: T) => string) => {
      const m = new Map<string, T[]>();
      for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
      return m;
    };
    const entityName = new Map(entityRows.map((e) => [e.id.toString(), e.name]));
    const affinity = new Map<string, number>();
    for (const a of affinityRows) if (same(a.owner, identity)) affinity.set(a.feature, decayScore(a.score, ms(a.updatedAt), at));
    const memory = new Map<string, MemoryRow>();
    for (const m of memoryRows) {
      if (same(m.owner, identity)) memory.set(m.topicId.toString(), { shown: m.shown, engaged: m.engaged, hiddenUntil: ms(m.hiddenUntil) });
    }
    const chatsByTopic = new Map<string, { total: number; live24h: number }>();
    for (const c of chatRows) {
      const k = c.topicId.toString();
      const cur = chatsByTopic.get(k) ?? { total: 0, live24h: 0 };
      cur.total++;
      if (c.status === "live" && at - ms(c.lastAt) < 86_400_000) cur.live24h++;
      chatsByTopic.set(k, cur);
    }
    const waitingByTopic = new Map<string, number>();
    for (const tk of ticketRows) {
      if (same(tk.identity, identity)) continue;
      const k = tk.topicId.toString();
      waitingByTopic.set(k, (waitingByTopic.get(k) ?? 0) + 1);
    }
    return {
      topics: derived.topics,
      tagsByTopic: new Map([...group(topicTagRows, (r) => r.topicId.toString())].map(([k, rs]) => [k, rs.map((r) => r.tag)])),
      toneByTopic: new Map(topicMetaRows.map((m) => [m.topicId.toString(), m.tone])),
      entitiesByTopic: new Map(
        [...group(topicEntityRows, (r) => r.topicId.toString())].map(([k, rs]) => [
          k,
          rs.map((r): FeedEntity => ({ id: r.entityId.toString(), name: entityName.get(r.entityId.toString()) ?? "", weight: r.weight })),
        ])
      ),
      affinity,
      memory,
      chatsByTopic,
      waitingByTopic,
      tagNames: new Map(tags.map((t) => [t.slug, t.name])),
      categoryNames: new Map(derived.categories.map((c) => [c.slug, c.name])),
      now: at,
      seed: identity?.toHexString() ?? "anon",
    };
  }, [now, identity, derived.topics, derived.categories, tags, topicTagRows, topicMetaRows, entityRows, topicEntityRows, affinityRows, memoryRows, chatRows, ticketRows]);
  const feed: Topic[] = useMemo(() => rankFeed(feedInputs), [feedInputs]);
  // View yaaps: conversations ranked through their topic, with like-based popularity.
  const convoFeed: Convo[] = useMemo(() => {
    const memory = new Map<string, ConvoMemoryRow>();
    for (const m of convoMemoryRows) if (same(m.owner, identity)) memory.set(m.chatId.toString(), { shown: m.shown, opened: m.opened, read: m.read });
    const readers = new Map(chatStatsRows.map((r) => [r.chatId.toString(), r.readers]));
    return rankConvos({ convos: derived.convos, topicInputs: feedInputs, memory, readers });
  }, [feedInputs, derived.convos, convoMemoryRows, chatStatsRows, identity]);

  // Impressions: cards report themselves once per visit; we send them in batches.
  // Only players with a finished profile are tracked (the server refuses the rest).
  const canTrack = !!derived.me?.username;
  const canTrackRef = useRef(canTrack);
  const pendingImpressions = useRef(new Set<string>());
  const sentImpressions = useRef(new Set<string>());
  useEffect(() => {
    canTrackRef.current = canTrack;
  }, [canTrack]);
  useEffect(() => {
    const flush = () => {
      if (!canTrackRef.current || pendingImpressions.current.size === 0) return;
      const ids = [...pendingImpressions.current].slice(0, 50);
      ids.forEach((id) => pendingImpressions.current.delete(id));
      trackImpressions({ topicIds: ids.map((id) => BigInt(id)) }).catch(() => {});
    };
    const every = setInterval(flush, IMPRESSION_FLUSH_MS);
    return () => {
      clearInterval(every);
      flush();
    };
  }, [trackImpressions]);
  const reportImpression = useCallback((topicId: string) => {
    if (sentImpressions.current.has(topicId)) return;
    sentImpressions.current.add(topicId);
    pendingImpressions.current.add(topicId);
  }, []);

  // Same batching for conversation cards on View yaaps.
  const pendingConvoImpressions = useRef(new Set<string>());
  const sentConvoImpressions = useRef(new Set<string>());
  useEffect(() => {
    const flush = () => {
      if (!canTrackRef.current || pendingConvoImpressions.current.size === 0) return;
      const ids = [...pendingConvoImpressions.current].slice(0, 50);
      ids.forEach((id) => pendingConvoImpressions.current.delete(id));
      trackConvoImpressions({ chatIds: ids.map((id) => BigInt(id)) }).catch(() => {});
    };
    const every = setInterval(flush, IMPRESSION_FLUSH_MS);
    return () => {
      clearInterval(every);
      flush();
    };
  }, [trackConvoImpressions]);
  const reportConvoImpression = useCallback((chatId: string) => {
    if (sentConvoImpressions.current.has(chatId)) return;
    sentConvoImpressions.current.add(chatId);
    pendingConvoImpressions.current.add(chatId);
  }, []);

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
      advanceMatch: (chatId: string) => advanceMatch({ chatId: BigInt(chatId) }),
      passTurn: (chatId: string) => passTurn({ chatId: BigInt(chatId) }),
      yieldEngagement: (chatId: string) => yieldEngagement({ chatId: BigInt(chatId) }),
      submitJudgingResult: (chatId: string, resultJson: string) => submitJudgingResult({ chatId: BigInt(chatId), resultJson }),
      /** Opening a topic or conversation ("open"), or reading one for 20 s+ ("read"). Callers check `canTrack` first. */
      trackEvent: (topicId: string, kind: "open" | "read") => trackEvent({ topicId: BigInt(topicId), kind }).catch(() => {}),
      setInterests: (interests: string[]) => setInterests({ interests }),
      reportImpression,
      /** Spectating a conversation: "open", or "read" after 20 s. Also counts toward its topic. Callers check `canTrack` first. */
      trackConvoEvent: (chatId: string, kind: "open" | "read") => trackConvoEvent({ chatId: BigInt(chatId), kind }).catch(() => {}),
      reportConvoImpression,
    }),
    [joinQueue, leaveQueue, dismissNotifications, sendMessage, toggleLike, createTopic, setName, completeProfile, advanceMatch, passTurn, yieldEngagement, submitJudgingResult, trackEvent, setInterests, reportImpression, trackConvoEvent, reportConvoImpression]
  );

  return {
    ready,
    connected: isActive,
    connectionError,
    identity,
    ...derived,
    /** Topics in personalised order (see lib/recommend.ts). */
    feed,
    /** Signed in with a finished profile, so activity can feed the recommender. */
    canTrack,
    /** The profile and topic features have loaded and the clock has ticked: safe to snapshot `feed`. */
    feedReady: ready && now > 0 && tagsReady && topicTagsReady && topicEntitiesReady && affinityReady && memoryReady,
    /** Conversations in personalised order for View yaaps (see lib/recommend.ts rankConvos). */
    convoFeed,
    convoFeedReady: ready && now > 0 && tagsReady && topicTagsReady && topicEntitiesReady && affinityReady && convoMemoryReady && chatStatsReady,
    /** The app-wide tag list, for the interests picker. */
    tags,
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
