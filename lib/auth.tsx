"use client";

/**
 * Google sign-in (Google Identity Services).
 *
 * The Google ID token *is* the SpacetimeDB login: SpacetimeProvider connects
 * with it, and the server derives a stable identity from it. Signed-out
 * visitors connect anonymously and can only browse.
 *
 * ID tokens expire after an hour. Because a token can only be swapped by
 * reconnecting, we settle on a token *before* the app connects: a returning
 * user's expired token is silently refreshed (Google auto-select) while a short
 * splash shows. Explicit sign-in / sign-out reload the page with the new state.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const TOKEN_KEY = "yaapi/google_id_token";
const SILENT_REFRESH_TIMEOUT_MS = 4000;
const GIS_SRC = "https://accounts.google.com/gsi/client";

/* ---------------- minimal Google Identity Services types ---------------- */

type CredentialResponse = { credential: string };
type PromptMoment = { isNotDisplayed(): boolean; isSkippedMoment(): boolean; isDismissedMoment(): boolean };
type GoogleId = {
  initialize(opts: {
    client_id: string;
    callback: (r: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }): void;
  prompt(listener?: (m: PromptMoment) => void): void;
  renderButton(el: HTMLElement, opts: Record<string, string | number>): void;
  disableAutoSelect(): void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

/* ---------------- token storage ---------------- */

function storage<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
const readToken = () => storage(() => localStorage.getItem(TOKEN_KEY), null);
const writeToken = (t: string | null) => storage(() => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)), undefined);

/** Seconds-since-epoch `exp` from a JWT, or 0 if unreadable. */
function tokenExpiry(token: string): number {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return Number(JSON.parse(atob(payload)).exp) || 0;
  } catch {
    return 0;
  }
}
const isFresh = (token: string) => tokenExpiry(token) * 1000 > Date.now() + 60_000;
export const tokenExpired = (token: string) => tokenExpiry(token) * 1000 <= Date.now();

/* ---------------- GIS loader ---------------- */

let gisPromise: Promise<GoogleId> | null = null;
let onCredential: (token: string) => void = () => {};

function loadGoogle(): Promise<GoogleId> {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const ready = () => {
      const id = window.google?.accounts.id;
      if (!id) return reject(new Error("Google sign-in failed to load"));
      id.initialize({
        client_id: CLIENT_ID,
        callback: (r) => onCredential(r.credential),
        auto_select: true,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true,
      });
      resolve(id);
    };
    if (window.google?.accounts?.id) return ready();
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = ready;
    s.onerror = () => {
      gisPromise = null;
      reject(new Error("Couldn't reach Google sign-in"));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

/* ---------------- context ---------------- */

type Status = "loading" | "signed-in" | "signed-out";
type Auth = {
  status: Status;
  /** Google ID token to connect with, when signed in. */
  token: string | undefined;
  /** False until NEXT_PUBLIC_GOOGLE_CLIENT_ID is set. */
  configured: boolean;
  signOut: () => void;
};

const AuthContext = createContext<Auth | null>(null);

export function useAuth() {
  const a = useContext(AuthContext);
  if (!a) throw new Error("useAuth must be used under <AuthProvider>");
  return a;
}

/**
 * What's in storage, as a stable string for useSyncExternalStore:
 * a usable token, "stale" (expired — try a silent refresh), or "none".
 */
function readSnapshot(): string {
  const t = readToken();
  if (!t) return "none";
  return isFresh(t) ? t : "stale";
}
// Another tab signed in or out: our connection is on the old identity, so start over.
const subscribeStorage = () => {
  const onChange = (e: StorageEvent) => {
    if (e.key === TOKEN_KEY) window.location.reload();
  };
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // The server can't see localStorage, so it renders the splash ("unknown") and
  // the client fills in after hydration.
  const snapshot = useSyncExternalStore(subscribeStorage, readSnapshot, () => "unknown");
  // Bumped after a silent refresh writes storage, so we re-read the snapshot.
  const [, setRefreshed] = useState(0);
  const needsRefresh = snapshot === "stale" && !!CLIENT_ID;

  const status: Status =
    snapshot === "unknown" || needsRefresh ? "loading" : snapshot === "none" || snapshot === "stale" ? "signed-out" : "signed-in";
  const token = status === "signed-in" ? snapshot : undefined;

  // Returning user with an expired token: try a silent refresh before connecting.
  useEffect(() => {
    if (!needsRefresh) return;
    let settled = false;
    const finish = (fresh: string | null) => {
      if (settled) return;
      settled = true;
      writeToken(fresh);
      setRefreshed((n) => n + 1);
    };
    onCredential = (t) => finish(t);
    const timer = setTimeout(() => finish(null), SILENT_REFRESH_TIMEOUT_MS);
    loadGoogle()
      .then((id) =>
        id.prompt((m) => {
          if (m.isNotDisplayed() || m.isSkippedMoment() || m.isDismissedMoment()) finish(null);
        })
      )
      .catch(() => finish(null));
    return () => clearTimeout(timer);
  }, [needsRefresh]);

  // Once the app is running, a new credential (from the button or One Tap) means
  // reconnect as that user — a reload is the clean way to swap connections.
  useEffect(() => {
    if (status === "loading") return;
    onCredential = (t) => {
      writeToken(t);
      window.location.reload();
    };
  }, [status]);

  const signOut = useCallback(() => {
    writeToken(null);
    window.google?.accounts.id.disableAutoSelect();
    window.location.reload();
  }, []);

  return (
    <AuthContext.Provider value={{ status, token, configured: !!CLIENT_ID, signOut }}>
      {status === "loading" ? <Splash /> : children}
    </AuthContext.Provider>
  );
}

function Splash() {
  return (
    <p role="status" className="p-10 text-center text-sm font-semibold text-[#5E5A72]">
      Signing you in…
    </p>
  );
}

/* ---------------- the button ---------------- */

/** Google's own "Sign in with Google" button (their branding rules require it). */
export function GoogleButton() {
  const { configured } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    let live = true;
    loadGoogle()
      .then((id) => {
        if (live && ref.current) {
          id.renderButton(ref.current, { theme: "outline", size: "large", shape: "pill", text: "signin_with", logo_alignment: "left" });
        }
      })
      .catch((e: unknown) => live && setFailed(e instanceof Error ? e.message : "Google sign-in is unavailable"));
    return () => {
      live = false;
    };
  }, [configured]);

  if (!configured) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-[#1E1B2E] bg-white px-3 py-2 text-xs font-semibold text-[#5E5A72]">
        Google sign-in isn&apos;t set up yet: add <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> to <code>.env.local</code>.
      </p>
    );
  }
  if (failed) return <p className="text-xs font-bold text-[#A3103F]">{failed}</p>;
  return <div ref={ref} className="flex min-h-[44px] justify-center" />;
}
