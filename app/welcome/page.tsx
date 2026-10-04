"use client";

/**
 * First-time profile setup, right after the first Google sign-in: claim a
 * username and pick a display name. ProfileGate sends new players here; the
 * server also refuses play actions until this is done.
 *
 * /welcome?next=/topics/3  → returns there afterwards
 */

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { Avatar, Icon, Loading, SignInCard, card, displayFont, press } from "@/components/ui";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** "Zhan Feng!" → "zhanfeng" */
function suggestUsername(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
}

/** Only allow a safe local path, so ?next= can't bounce people off-site. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/welcome") ? next : "/";
}

export default function WelcomePage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <Welcome />
    </Suspense>
  );
}

function Welcome() {
  const router = useRouter();
  const { status } = useAuth();
  const { ready, me } = useStore();
  const next = safeNext(useSearchParams().get("next"));
  const done = !!me?.username;

  // Profile exists (just created, or you landed here by accident) → carry on.
  useEffect(() => {
    if (done) router.replace(next);
  }, [done, next, router]);

  if (status === "signed-out") {
    return (
      <main className="mx-auto max-w-md px-4 pt-10">
        <SignInCard why="Sign in with Google to create your profile." />
      </main>
    );
  }
  if (!ready || !me || done) return <Loading />;
  return <SetupForm googleName={me.name} />;
}

function SetupForm({ googleName }: { googleName: string }) {
  const { actions, usernameTaken } = useStore();
  const [displayName, setDisplayName] = useState(googleName);
  const [username, setUsername] = useState(() => suggestUsername(googleName));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = username.trim().replace(/^@/, "").toLowerCase();
  const formatOk = USERNAME_RE.test(handle);
  const taken = formatOk && usernameTaken(handle);
  const nameOk = displayName.trim().length >= 2 && displayName.trim().length <= 24;
  const canSubmit = formatOk && !taken && nameOk && !saving;

  const usernameHint = !handle
    ? { tone: "muted", text: "3–20 letters, numbers or underscores." }
    : !formatOk
      ? { tone: "bad", text: "Use 3–20 lowercase letters, numbers or underscores." }
      : taken
        ? { tone: "bad", text: `@${handle} is taken.` }
        : { tone: "good", text: `@${handle} is available.` };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    actions
      .completeProfile(handle, displayName)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Couldn't save your profile");
        setSaving(false);
      });
  };

  const field =
    "mt-1 block min-h-[48px] w-full rounded-2xl border-2 border-[#1E1B2E] bg-white px-4 text-[15px] font-semibold placeholder:font-normal placeholder:text-[#8A86A0] focus:outline-none focus:ring-4 focus:ring-[#FFD43B]";

  return (
    <main className="mx-auto max-w-md px-4 pb-10 pt-8">
      <p className={`${displayFont} text-[30px] leading-none`}>
        Welcome to Debate
        <span className="ml-1 inline-block -rotate-3 rounded-lg border-2 border-[#1E1B2E] bg-[#FFD43B] px-1.5 py-0.5 text-[22px]">Battle</span>
      </p>
      <p className="mt-2 text-sm font-semibold text-[#5E5A72]">Set up your profile. This is how other players will see you.</p>

      <form onSubmit={submit} className={`${card} mt-6 space-y-4 p-5`} noValidate>
        {/* live preview */}
        <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-[#1E1B2E] bg-[#F6F3FF] p-3">
          <Avatar name={displayName.trim() || "?"} size={48} color="#FFD43B" />
          <span className="min-w-0">
            <span className="block truncate text-lg font-black">{displayName.trim() || "Your name"}</span>
            <span className="block truncate text-sm font-semibold text-[#5E5A72]">@{handle || "username"}</span>
          </span>
        </div>

        <label className="block text-sm font-extrabold">
          Display name
          <input
            className={field}
            value={displayName}
            maxLength={24}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
            aria-invalid={touched && !nameOk}
          />
          <span className={`mt-1 block text-xs font-semibold ${touched && !nameOk ? "text-[#A3103F]" : "text-[#5E5A72]"}`}>
            2–24 characters. You can change this any time.
          </span>
        </label>

        <label className="block text-sm font-extrabold">
          Username
          <span className="relative mt-1 block">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-bold text-[#5E5A72]">@</span>
            <input
              className={`${field} mt-0 pl-8`}
              value={username}
              maxLength={21}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              aria-invalid={!!handle && (!formatOk || taken)}
              aria-describedby="username-hint"
            />
          </span>
          <span
            id="username-hint"
            aria-live="polite"
            className={`mt-1 flex items-center gap-1 text-xs font-semibold ${
              usernameHint.tone === "bad" ? "text-[#A3103F]" : usernameHint.tone === "good" ? "text-[#1F7A55]" : "text-[#5E5A72]"
            }`}
          >
            {usernameHint.tone === "good" && <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} />}
            {usernameHint.text} Usernames can&apos;t be changed later.
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm font-bold text-[#A3103F]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className={`min-h-[52px] w-full rounded-full border-2 border-[#1E1B2E] bg-[#FFD43B] text-base font-black shadow-[4px_4px_0_#1E1B2E] disabled:opacity-60 ${press}`}
        >
          {saving ? "Saving…" : "Let's argue"}
        </button>
      </form>
    </main>
  );
}
