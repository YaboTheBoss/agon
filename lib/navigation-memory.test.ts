import assert from "node:assert/strict";
import test from "node:test";
import { createNavigationMemory, tabRoot } from "./navigation-memory";

test("a category tab retains its nested route and scroll through a reload", () => {
  const storage = new Map<string, string>();
  const adapter = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
  const memory = createNavigationMemory(adapter);
  memory.set("tab:/categories", "/categories/trending");
  memory.set("scroll:/categories/trending", { y: 940, containers: {} });
  memory.set("tab:/", "/");
  const reloaded = createNavigationMemory(adapter);
  assert.equal(JSON.parse(reloaded.get("tab:/categories")!), "/categories/trending");
  assert.equal(JSON.parse(reloaded.get("scroll:/categories/trending")!).y, 940);
});

test("page filters and drafts retain their own independent state", () => {
  const memory = createNavigationMemory();
  memory.set("feed:tab", "convos");
  memory.set("me:filter", "comp");
  memory.set("chat:42:draft", "An unfinished argument");
  memory.set("feed:tab", "start");
  assert.equal(JSON.parse(memory.get("me:filter")!), "comp");
  assert.equal(JSON.parse(memory.get("chat:42:draft")!), "An unfinished argument");
});

test("storage failure preserves memory and updates subscribers", () => {
  const memory = createNavigationMemory({ getItem() { throw new Error("Blocked"); }, setItem() { throw new Error("Blocked"); } });
  let changes = 0;
  const unsubscribe = memory.subscribe(() => changes++);
  memory.set("tab:/categories", "/search?q=pizza");
  memory.set("tab:/categories", "/search?q=pizza");
  assert.equal(changes, 1);
  assert.equal(JSON.parse(memory.get("tab:/categories")!), "/search?q=pizza");
  unsubscribe();
});

test("nested routes belong to the correct navigation tab", () => {
  assert.equal(tabRoot("/categories/trending"), "/categories");
  assert.equal(tabRoot("/search"), "/categories");
  assert.equal(tabRoot("/topics/8"), "/");
  assert.equal(tabRoot("/me"), "/me");
  assert.equal(tabRoot("/chat/8"), undefined);
});
