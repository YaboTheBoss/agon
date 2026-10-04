"use client";

/**
 * "You got paired with another user!" — shown on any page when someone gets
 * matched with a ticket you left in the queue. Opening the chat (here or from
 * My yaapi) clears it.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { Icon, card, displayFont, press } from "@/components/ui";

export default function PairToast() {
  const pathname = usePathname() ?? "/";
  const { notifications, actions } = useStore();
  const n = notifications.find((x) => pathname !== `/chat/${x.chatId}`);
  if (!n || pathname.startsWith("/welcome")) return null;

  const more = notifications.length - 1;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div
        role="status"
        aria-live="polite"
        className={`${card} pointer-events-auto mx-auto flex max-w-md items-center gap-3 bg-[#FFD43B] p-3 motion-safe:animate-[pop_.25s_ease-out]`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#1E1B2E] bg-white">
          <Icon name="users" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`${displayFont} block text-base leading-tight`}>{n.text}</span>
          <span className="block truncate text-xs font-bold text-[#1E1B2E]/75">
            {n.title}
            {more > 0 && ` · +${more} more`}
          </span>
        </span>
        <Link
          href={`/chat/${n.chatId}`}
          className={`flex min-h-[40px] shrink-0 items-center rounded-full border-2 border-[#1E1B2E] bg-white px-3 text-sm font-black shadow-[2px_2px_0_#1E1B2E] ${press}`}
        >
          Open
        </Link>
        <button
          onClick={() => actions.dismissNotifications(n.chatId).catch(() => {})}
          aria-label="Dismiss"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
