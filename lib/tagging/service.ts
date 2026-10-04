/**
 * AI topic tagging, run on the server (app/api/tagging). Connects to SpacetimeDB
 * as the registered tagging service, finds topics that only have keyword tags,
 * asks the model for features and submits them with set_topic_features — which
 * the database accepts from this identity only.
 *
 * Callers can trigger a run but can't influence the result: topics and the tag
 * list are read from the database, never from the request.
 */

import "server-only";

import { DbConnection } from "@/lib/module_bindings";
import type { TagOption, TopicForTagging } from "./prompt";
import type { TopicFeatures } from "./validate";

export type GenerateFeatures = (topic: TopicForTagging, tags: TagOption[]) => Promise<TopicFeatures>;
export type TaggingRun = { tagged: { topicId: string; title: string; tags: string[]; entities: string[] }[]; failed: { topicId: string; error: string }[] };

export class TaggingNotConfiguredError extends Error {}

/** Topics tagged per request. Each is one model call, so this bounds request time and cost. */
export const MAX_TOPICS_PER_RUN = 3;
const CONNECT_TIMEOUT_MS = 10_000;

function settings() {
  const token = process.env.SPACETIMEDB_SERVICE_TOKEN;
  if (!token) throw new TaggingNotConfiguredError("SPACETIMEDB_SERVICE_TOKEN is not configured.");
  return {
    token,
    uri: process.env.SPACETIMEDB_URI ?? process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "ws://localhost:3010",
    db: process.env.SPACETIMEDB_DB ?? process.env.NEXT_PUBLIC_SPACETIMEDB_DB ?? "yaapi-dev",
  };
}

/** Open a service connection with topics, their tagging status and the tag list loaded; always disconnects. */
export function withServiceConnection<T>(work: (conn: DbConnection) => Promise<T>): Promise<T> {
  const { token, uri, db } = settings();
  return new Promise<T>((resolve, reject) => {
    // Callbacks below run asynchronously, after `timer` (declared last) exists.
    const fail = (error: unknown) => {
      clearTimeout(timer);
      reject(error);
    };
    const conn = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(db)
      .withToken(token)
      .onConnect((c) => {
        c.subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            work(c)
              .then(resolve, reject)
              .finally(() => c.disconnect());
          })
          .onError(() => fail(new Error("Subscription to SpacetimeDB failed.")))
          .subscribe(["SELECT * FROM topic", "SELECT * FROM topic_meta", "SELECT * FROM tag"]);
      })
      .onConnectError((_ctx, err) => fail(err))
      .build();
    const timer = setTimeout(() => {
      conn.disconnect();
      reject(new Error("Timed out connecting to SpacetimeDB."));
    }, CONNECT_TIMEOUT_MS);
  });
}

/** Topics still on keyword tags (or untagged), newest first. Seed topics keep their hand-written tags. */
export function pendingTopics(conn: DbConnection, limit = MAX_TOPICS_PER_RUN) {
  return [...conn.db.topic.iter()]
    .filter((t) => {
      const meta = conn.db.topicMeta.topicId.find(t.id);
      return !meta || meta.source === "keywords";
    })
    .sort((x, y) => (x.createdAt.microsSinceUnixEpoch > y.createdAt.microsSinceUnixEpoch ? -1 : 1))
    .slice(0, limit);
}

/** Tag up to MAX_TOPICS_PER_RUN pending topics. One topic failing doesn't stop the others. */
export function tagPendingTopics(generate: GenerateFeatures, limit = MAX_TOPICS_PER_RUN): Promise<TaggingRun> {
  return withServiceConnection(async (conn) => {
    const tags: TagOption[] = [...conn.db.tag.iter()].sort((x, y) => x.sort - y.sort).map((t) => ({ slug: t.slug, name: t.name }));
    const run: TaggingRun = { tagged: [], failed: [] };
    if (tags.length === 0) return run;

    for (const t of pendingTopics(conn, limit)) {
      try {
        const f = await generate({ title: t.title, sideA: t.sideA, sideB: t.sideB, category: t.category }, tags);
        await conn.reducers.setTopicFeatures({ topicId: t.id, tags: f.tags, tone: f.tone, entities: f.entities });
        run.tagged.push({ topicId: t.id.toString(), title: t.title, tags: f.tags, entities: f.entities.map((e) => e.name) });
      } catch (error) {
        run.failed.push({ topicId: t.id.toString(), error: error instanceof Error ? error.message : String(error) });
      }
    }
    return run;
  });
}
