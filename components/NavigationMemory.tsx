"use client";

import { useLayoutEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pageMemory } from "@/lib/page-memory";
import { tabRoot } from "@/lib/navigation-memory";

type Position = { y: number; containers: Record<string, number> };

export default function NavigationMemory() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const url = pathname + (query ? `?${query}` : "");

  useLayoutEffect(() => {
    const memory = pageMemory();
    const root = tabRoot(pathname);
    if (root) memory.set(`tab:${root}`, url);
    const saved = memory.get(`scroll:${url}`);
    const position: Position = saved ? JSON.parse(saved) : { y: 0, containers: {} };
    let restoring = true;
    let frame = 0;
    let writeTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      if (restoring) { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); }
    });
    const stopRestoring = () => {
      restoring = false;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      observer.disconnect();
      mutations.disconnect();
    };
    const save = () => {
      const currentUrl = window.location.pathname + (window.location.search ? `?${new URLSearchParams(window.location.search).toString()}` : "");
      if (restoring || currentUrl !== url) return;
      const containers: Record<string, number> = {};
      document.querySelectorAll<HTMLElement>("[data-scroll-memory]").forEach((element) => {
        containers[element.dataset.scrollMemory!] = element.scrollTop;
      });
      memory.set(`scroll:${url}`, { y: window.scrollY, containers });
    };
    function restore() {
      if (!restoring) return;
      window.scrollTo({ top: position.y, behavior: "instant" });
      let complete = Math.abs(window.scrollY - position.y) <= 1;
      for (const [key, top] of Object.entries(position.containers)) {
        const element = [...document.querySelectorAll<HTMLElement>("[data-scroll-memory]")].find((node) => node.dataset.scrollMemory === key);
        if (!element) { complete = false; continue; }
        element.scrollTop = top;
        if (Math.abs(element.scrollTop - top) > 1) complete = false;
      }
      if (complete) {
        // Let Next's navigation scroll finish before applying our final position.
        frame = requestAnimationFrame(() => {
          window.scrollTo({ top: position.y, behavior: "instant" });
          stopRestoring();
        });
      }
    }
    const onScroll = () => {
      if (restoring || writeTimer) return;
      writeTimer = setTimeout(() => { writeTimer = undefined; save(); }, 120);
    };
    const onReset = () => {
      stopRestoring();
      window.scrollTo({ top: 0, behavior: "instant" });
      save();
    };
    const onLink = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (target) save();
    };
    const onIntent = () => stopRestoring();
    const mutations = new MutationObserver(() => {
      if (restoring) { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); }
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    observer.observe(document.body);
    const timer = setTimeout(stopRestoring, 10_000);
    frame = requestAnimationFrame(restore);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("click", onLink, true);
    window.addEventListener("pagehide", save);
    window.addEventListener("wheel", onIntent, { passive: true });
    window.addEventListener("touchstart", onIntent, { passive: true });
    window.addEventListener("keydown", onIntent);
    window.addEventListener("yaapi:reset-scroll", onReset);
    return () => {
      save();
      stopRestoring();
      clearTimeout(writeTimer);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("click", onLink, true);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("wheel", onIntent);
      window.removeEventListener("touchstart", onIntent);
      window.removeEventListener("keydown", onIntent);
      window.removeEventListener("yaapi:reset-scroll", onReset);
    };
  }, [pathname, url]);
  return null;
}
