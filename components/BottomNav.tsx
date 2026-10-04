"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, press } from "@/components/ui";
import { useStore } from "@/lib/store";

const TABS = [
  { href: "/", label: "Feed", icon: "house", color: "#FFD43B", match: (p: string) => p === "/" || p.startsWith("/topics") },
  { href: "/categories", label: "Categories", icon: "grid", color: "#7EE0B5", match: (p: string) => p.startsWith("/categories") },
  { href: "/me", label: "My Chats", icon: "chat", color: "#8EA2FF", match: (p: string) => p.startsWith("/me") },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy", color: "#FF8FB1", match: (p: string) => p.startsWith("/leaderboard") },
] as const;

// Full-screen pages that bring their own bottom bar (composer / spectator bar).
const HIDDEN_ON = ["/convos/", "/chat/", "/welcome"];

export default function BottomNav() {
  const pathname = usePathname() ?? "/";
  const { notifications, myTickets } = useStore();
  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <>
      {/* spacer so page content can scroll clear of the floating bar */}
      <div aria-hidden="true" className="h-28" />
      <nav
        aria-label="Main"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <ul className="pointer-events-auto mx-auto flex max-w-md gap-1 rounded-full border-2 border-[#1E1B2E] bg-white p-1.5 shadow-[4px_4px_0_#1E1B2E]">
          {TABS.map((t) => {
            const active = t.match(pathname);
            return (
              <li key={t.href} className="min-w-0 flex-1">
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-full border-2 text-[11px] font-extrabold ${press} ${
                    active ? "border-[#1E1B2E] text-[#1E1B2E] shadow-[2px_2px_0_#1E1B2E]" : "border-transparent text-[#5E5A72] hover:text-[#1E1B2E]"
                  }`}
                  style={{ background: active ? t.color : "transparent" }}
                >
                  <span className="relative">
                    <Icon name={t.icon} className="h-5 w-5" />
                    {t.href === "/me" && notifications.length > 0 && (
                      <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-[#D6336C] px-0.5 text-[9px] font-black text-white">
                        {notifications.length}
                        <span className="sr-only"> new pairing{notifications.length > 1 ? "s" : ""}</span>
                      </span>
                    )}
                    {t.href === "/me" && notifications.length === 0 && myTickets.length > 0 && (
                      <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#FFB27A]" aria-hidden="true" />
                    )}
                  </span>
                  <span className="max-w-full truncate px-1">{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
