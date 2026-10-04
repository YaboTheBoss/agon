"use client";

/**
 * Sends signed-in players who haven't picked a username yet to /welcome,
 * remembering where they were so setup can send them back.
 */

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

export default function ProfileGate() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { ready, needsProfile } = useStore();

  useEffect(() => {
    if (ready && needsProfile && !pathname.startsWith("/welcome")) {
      router.replace(`/welcome?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, needsProfile, pathname, router]);

  return null;
}
