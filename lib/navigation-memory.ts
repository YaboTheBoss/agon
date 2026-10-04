export type StorageLike = Pick<Storage, "getItem" | "setItem">;
const STORAGE_KEY = "yaapi/navigation-memory";

export function tabRoot(pathname: string): string | undefined {
  if (pathname === "/" || pathname.startsWith("/topics/")) return "/";
  if (pathname === "/categories" || pathname.startsWith("/categories/") || pathname === "/search") return "/categories";
  if (pathname === "/leaderboard") return "/leaderboard";
  if (pathname === "/me") return "/me";
}

export function createNavigationMemory(storage?: StorageLike) {
  const values: Record<string, string> = {};
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      for (const [key, value] of Object.entries(saved)) {
        if (typeof value === "string") values[key] = value;
      }
    }
  } catch { /* A fresh session also works when storage is unavailable. */ }
  const listeners = new Set<() => void>();
  return {
    get(key: string) { return values[key] ?? null; },
    set(key: string, value: unknown) {
      const encoded = JSON.stringify(value);
      if (values[key] === encoded) return;
      values[key] = encoded;
      try { storage?.setItem(STORAGE_KEY, JSON.stringify(values)); } catch { /* Retain in memory. */ }
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
