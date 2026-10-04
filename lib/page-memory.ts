"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore, type SetStateAction } from "react";
import { createNavigationMemory } from "./navigation-memory";

let memory: ReturnType<typeof createNavigationMemory> | undefined;
export function pageMemory() {
  if (!memory) {
    let storage: Storage | undefined;
    try { storage = window.sessionStorage; } catch { /* Use in-memory persistence. */ }
    memory = createNavigationMemory(storage);
  }
  return memory;
}

export function usePageState<T>(key: string, initial: T | (() => T)) {
  const fallback = useMemo(() => typeof initial === "function" ? (initial as () => T)() : initial, [initial]);
  const subscribe = useCallback((listener: () => void) => pageMemory().subscribe(listener), []);
  const snapshot = useCallback(() => pageMemory().get(key), [key]);
  const encoded = useSyncExternalStore(subscribe, snapshot, () => null);
  const value = useMemo(() => {
    try { return encoded === null ? fallback : JSON.parse(encoded) as T; }
    catch { return fallback; }
  }, [encoded, fallback]);
  useEffect(() => {
    if (pageMemory().get(key) === null) pageMemory().set(key, fallback);
  }, [key, fallback]);
  const setValue = useCallback((next: SetStateAction<T>) => {
    const current = pageMemory().get(key);
    const previous = current === null ? fallback : JSON.parse(current) as T;
    pageMemory().set(key, typeof next === "function" ? (next as (value: T) => T)(previous) : next);
  }, [key, fallback]);
  return [value, setValue] as const;
}
