"use client";

import { useSyncExternalStore } from "react";
import type { Mode } from "@/lib/data";

const STORAGE_KEY = "yaapi/play-mode";
const CHANGE_EVENT = "yaapi:play-mode";
let fallback: Mode = "casual";

function snapshot(): Mode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "comp" || saved === "casual" ? saved : fallback;
  } catch {
    return fallback;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function setMode(mode: Mode) {
  fallback = mode;
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* Navigation still retains the in-memory selection. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function usePlayMode() {
  const mode = useSyncExternalStore(subscribe, snapshot, () => "casual" as Mode);
  return { mode, setMode };
}
