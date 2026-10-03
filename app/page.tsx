"use client";

/**
 * Debate Battleground — Home Page (Dashboard + Explore)
 * Next.js App Router + Tailwind CSS. Mobile-first, scales up to desktop.
 *
 * Drop this file in at `app/page.tsx`. No extra dependencies: icons are
 * inline SVG and fonts load through next/font.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------ */
/* Types + mock data (swap for Spacetime queries later)               */
/* ------------------------------------------------------------------ */

type Mode = "casual" | "competitive";
type Side = "pro" | "con";
type FeedTab = "trending" | "featured";

const USER = { name: "Zhan", initials: "ZZ", coins: 1240, elo: 1487 };

const DAILY = {
  topic: "Universities should allow AI tools on all graded coursework.",
  category: "Tech Policy",
  proShare: 68, // % of players who picked Pro today
  endsIn: "07:42:15",
  playersToday: 2318,
};

const NOTIFICATIONS = [
  { id: 1, who: "Biplav", text: "replied in the EcoData tech policy thread", time: "2m", unread: true },
  { id: 2, who: "The Troll", text: "challenged you to a rematch", time: "1h", unread: true },
  { id: 3, who: "Zeta Pi", text: "posted a new mixer room", time: "3h", unread: false },
];

const TRENDING = [
  { id: 1, title: "Social media companies should verify the age of every user.", category: "Tech", queue: 142, hot: true },
  { id: 2, title: "Carbon taxes do more good than cap-and-trade.", category: "Climate", queue: 87, hot: false },
  { id: 3, title: "College athletes should be paid as employees.", category: "Sports", queue: 64, hot: true },
  { id: 4, title: "Remote work is better for early-career engineers.", category: "Work", queue: 51, hot: false },
  { id: 5, title: "Open-source AI models make the world safer.", category: "AI Ethics", queue: 39, hot: false },
];

const FEATURED = [
  {
    id: 1,
    status: "live" as const,
    topic: "Should data science ethics be a required course?",
    org: "EcoData",
    a: { name: "Biplav", initials: "BP", score: 82 },
    b: { name: "Maya", initials: "MR", score: 77 },
    phrases: ["“Correlation isn’t a syllabus.”", "Steelman bonus +12"],
    viewers: 312,
  },
  {
    id: 2,
    status: "final" as const,
    topic: "Greek life does more good than harm on campus.",
    org: "Zeta Pi",
    a: { name: "Jordan", initials: "JK", score: 91 },
    b: { name: "The Troll", initials: "TT", score: 44 },
    phrases: ["Ad hominem flagged ×3", "“Show me the base rate.”"],
    viewers: 1204,
  },
  {
    id: 3,
    status: "final" as const,
    topic: "Nuclear power is the fastest route to net zero.",
    org: "Open Arena",
    a: { name: "Priya", initials: "PS", score: 88 },
    b: { name: "Leo", initials: "LW", score: 86 },
    phrases: ["Common ground found", "“Cost per ton is the crux.”"],
    viewers: 845,
  },
];

/* ------------------------------------------------------------------ */
/* Icons (inline stroke SVG)                                          */
/* ------------------------------------------------------------------ */

function Icon({ d, className = "h-5 w-5" }: { d: string | string[]; className?: string }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

const ICONS = {
  bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"],
  coin: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5", "M12 6v2", "M12 16v2"],
  bot: ["M12 8V4H8", "M4 8h16v12H4z", "M2 14h2", "M20 14h2", "M15 13v2", "M9 13v2"],
  plus: ["M12 5v14", "M5 12h14"],
  flame: ["M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3 0 1.5 1 3 2.5 3z"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  eye: ["M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  clock: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 6v6l4 2"],
  arrow: ["M5 12h14", "M12 5l7 7-7 7"],
  trophy: ["M6 9H4.5a2.5 2.5 0 0 1 0-5H6", "M18 9h1.5a2.5 2.5 0 0 0 0-5H18", "M4 22h16", "M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22", "M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22", "M18 2H6v7a6 6 0 0 0 12 0V2z"],
  x: ["M18 6 6 18", "M6 6l12 12"],
};

/* ------------------------------------------------------------------ */
/* Small building blocks                                              */
/* ------------------------------------------------------------------ */

function Avatar({ initials, tone = "neutral", size = "md" }: { initials: string; tone?: "pro" | "con" | "neutral"; size?: "sm" | "md" | "lg" }) {
  const tones = {
    pro: "bg-[#4C8DFF] text-[#0B0D12]",
    con: "bg-[#FF8A3D] text-[#0B0D12]",
    neutral: "bg-[#2A3142] text-[#EEF1F6]",
  };
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-base" };
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-[#0B0D12] ${tones[tone]} ${sizes[size]}`}>
      {initials}
    </span>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div role="radiogroup" aria-label="Play mode" className="relative grid grid-cols-2 rounded-full border border-[#262C3B] bg-[#141821] p-1 text-xs font-semibold sm:text-sm">
      {/* sliding thumb */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full transition-all duration-300 ease-out ${
          mode === "casual" ? "translate-x-0 bg-[#2DD4BF]" : "translate-x-full bg-[#F5C451]"
        }`}
      />
      {(["casual", "competitive"] as Mode[]).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => onChange(m)}
          className={`relative z-10 min-h-[36px] rounded-full px-3 transition-colors sm:px-4 ${
            mode === m ? "text-[#0B0D12]" : "text-[#9AA3B5] hover:text-[#EEF1F6]"
          }`}
        >
          <span className="sm:hidden">{m === "casual" ? "Casual" : "Ranked"}</span>
          <span className="hidden sm:inline">{m === "casual" ? "Casual Mode" : "Competitive Mode"}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                             */
/* ------------------------------------------------------------------ */

function Header({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const [open, setOpen] = useState(false);
  const unread = NOTIFICATIONS.filter((n) => n.unread).length;

  return (
    <header className="sticky top-0 z-40 border-b border-[#1E2330] bg-[#0B0D12]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3">
        {/* Left: avatar + coins */}
        <button className="flex min-h-[44px] items-center gap-2 rounded-full pr-1" aria-label="Open profile">
          <Avatar initials={USER.initials} size="sm" />
          {mode === "competitive" && (
            <span className="hidden text-xs font-semibold text-[#9AA3B5] md:inline">
              ELO <span className="text-[#EEF1F6]">{USER.elo}</span>
            </span>
          )}
        </button>
        <div className="flex items-center gap-1.5 rounded-full border border-[#3A3420] bg-[#1F1B10] px-2.5 py-1.5 text-sm font-semibold text-[#F5C451]">
          <Icon d={ICONS.coin} className="h-4 w-4" />
          <span className="tabular-nums">{USER.coins.toLocaleString()}</span>
        </div>

        <div className="flex-1" />

        {/* Bell */}
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={`Notifications, ${unread} unread`}
            aria-expanded={open}
            className="relative flex h-11 w-11 items-center justify-center rounded-full text-[#C7CDD9] hover:bg-[#141821]"
          >
            <Icon d={ICONS.bell} />
            {unread > 0 && (
              <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF8A3D] px-1 text-[10px] font-bold text-[#0B0D12]">
                {unread}
              </span>
            )}
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#262C3B] bg-[#141821] shadow-2xl">
              <p className="border-b border-[#262C3B] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#9AA3B5]">Casual chats</p>
              <ul>
                {NOTIFICATIONS.map((n) => (
                  <li key={n.id}>
                    <a href="#" className="flex gap-3 px-4 py-3 text-sm hover:bg-[#1B2030]">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.unread ? "bg-[#FF8A3D]" : "bg-transparent"}`} />
                      <span className="flex-1 text-[#C7CDD9]">
                        <strong className="font-semibold text-[#EEF1F6]">{n.who}</strong> {n.text}
                      </span>
                      <span className="text-xs text-[#9AA3B5]">{n.time}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: mode toggle */}
        <ModeToggle mode={mode} onChange={setMode} />
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Hero: Daily Challenge + Quick Play / Host                          */
/* ------------------------------------------------------------------ */

function HeroBanner({ mode, onQueue }: { mode: Mode; onQueue: (label: string) => void }) {
  const conShare = 100 - DAILY.proShare;
  // The less popular stance earns the bigger multiplier.
  const underdog: Side = DAILY.proShare < 50 ? "pro" : "con";
  const multiplier = mode === "competitive" ? "2.5×" : "2×";

  const StanceButton = ({ side }: { side: Side }) => {
    const isPro = side === "pro";
    const boosted = underdog === side;
    return (
      <button
        onClick={() => onQueue(`Daily Challenge · ${isPro ? "Pro" : "Con"}`)}
        className={`group relative flex min-h-[64px] flex-1 flex-col items-start justify-center rounded-2xl px-4 py-3 text-left transition-transform active:scale-[0.98] sm:min-h-[76px] sm:px-5 ${
          isPro ? "bg-[#4C8DFF] hover:bg-[#6A9FFF]" : "bg-[#FF8A3D] hover:bg-[#FF9D5C]"
        } text-[#0B0D12]`}
      >
        <span className="font-[family-name:var(--font-display)] text-2xl font-extrabold leading-none sm:text-3xl">
          {isPro ? "PRO" : "CON"}
        </span>
        <span className="mt-1 text-xs font-medium opacity-80">
          {isPro ? DAILY.proShare : conShare}% picked this side
        </span>
        {boosted && (
          <span className="absolute -top-2.5 right-3 rounded-full bg-[#F5C451] px-2 py-0.5 text-[11px] font-bold text-[#0B0D12] shadow">
            {multiplier} coins
          </span>
        )}
      </button>
    );
  };

  return (
    <section aria-labelledby="daily-title" className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl border border-[#262C3B] bg-[#141821] p-5 sm:p-8">
        {/* arena stripes, subtle */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-[#4C8DFF]/[0.06]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[#FF8A3D]/[0.06]" />

        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full bg-[#EEF1F6] px-2.5 py-1 uppercase tracking-wider text-[#0B0D12]">Daily Challenge</span>
            <span className="rounded-full border border-[#262C3B] px-2.5 py-1 text-[#C7CDD9]">{DAILY.category}</span>
            {mode === "competitive" && (
              <span className="rounded-full border border-[#5A4A1A] px-2.5 py-1 text-[#F5C451]">Ranked · ELO on the line</span>
            )}
            <span className="ml-auto flex items-center gap-1 text-[#9AA3B5]">
              <Icon d={ICONS.clock} className="h-3.5 w-3.5" /> {DAILY.endsIn}
            </span>
          </div>

          <h1 id="daily-title" className="mt-4 max-w-3xl font-[family-name:var(--font-display)] text-[1.65rem] font-bold leading-[1.15] text-[#EEF1F6] sm:text-4xl lg:text-5xl">
            {DAILY.topic}
          </h1>

          {/* stance split bar */}
          <div className="mt-5" aria-label={`${DAILY.proShare}% Pro, ${conShare}% Con`}>
            <div className="flex h-2 overflow-hidden rounded-full bg-[#262C3B]">
              <div className="bg-[#4C8DFF]" style={{ width: `${DAILY.proShare}%` }} />
              <div className="bg-[#FF8A3D]" style={{ width: `${conShare}%` }} />
            </div>
            <p className="mt-2 text-xs text-[#9AA3B5]">
              {DAILY.playersToday.toLocaleString()} debaters today · pick the underdog side for a{" "}
              <span className="font-semibold text-[#F5C451]">{multiplier}</span> coin multiplier
            </p>
          </div>

          <div className="mt-5 flex gap-3">
            <StanceButton side="pro" />
            <StanceButton side="con" />
          </div>
        </div>
      </div>

      {/* Secondary actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onQueue("Quick Play · VS The Troll")}
          className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-[#262C3B] bg-[#141821] p-4 text-left hover:border-[#3A4255] hover:bg-[#1B2030]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2A1E14] text-[#FF8A3D]">
            <Icon d={ICONS.bot} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#EEF1F6] sm:text-base">Quick Play</span>
            <span className="block truncate text-xs text-[#9AA3B5]">VS The Troll bot</span>
          </span>
        </button>
        <button
          onClick={() => onQueue("Host Room · Zeta Pi mixer")}
          className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-[#262C3B] bg-[#141821] p-4 text-left hover:border-[#3A4255] hover:bg-[#1B2030]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#13233F] text-[#4C8DFF]">
            <Icon d={ICONS.plus} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#EEF1F6] sm:text-base">Host a Room</span>
            <span className="flex items-center gap-1 truncate text-xs text-[#9AA3B5]">
              <Icon d={ICONS.coin} className="h-3 w-3 text-[#F5C451]" /> 200 · private mixer
            </span>
          </span>
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Discovery feed                                                     */
/* ------------------------------------------------------------------ */

function TrendingList({ onQueue }: { onQueue: (label: string) => void }) {
  return (
    <ul className="divide-y divide-[#1E2330] overflow-hidden rounded-2xl border border-[#262C3B] bg-[#141821]">
      {TRENDING.map((t, i) => (
        <li key={t.id}>
          <button
            onClick={() => onQueue(`Trending · ${t.title}`)}
            className="group flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-[#1B2030] sm:px-5"
          >
            <span className="w-6 shrink-0 font-[family-name:var(--font-display)] text-xl font-bold text-[#4A5266]">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-snug text-[#EEF1F6]">{t.title}</span>
              <span className="mt-1 flex items-center gap-3 text-xs text-[#9AA3B5]">
                <span>{t.category}</span>
                <span className="flex items-center gap-1">
                  <Icon d={ICONS.users} className="h-3.5 w-3.5" /> {t.queue} in queue
                </span>
                {t.hot && (
                  <span className="flex items-center gap-1 text-[#FF8A3D]">
                    <Icon d={ICONS.flame} className="h-3.5 w-3.5" /> Hot
                  </span>
                )}
              </span>
            </span>
            <span className="hidden items-center gap-1 rounded-full bg-[#EEF1F6] px-3 py-2 text-xs font-semibold text-[#0B0D12] sm:flex">
              Queue <Icon d={ICONS.arrow} className="h-3.5 w-3.5" />
            </span>
            <Icon d={ICONS.arrow} className="h-5 w-5 shrink-0 text-[#9AA3B5] sm:hidden" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function FeaturedGrid() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURED.map((m) => (
        <li key={m.id}>
          <a href="#" className="group block overflow-hidden rounded-2xl border border-[#262C3B] bg-[#141821] hover:border-[#3A4255]">
            {/* Thumbnail */}
            <div className="relative aspect-video overflow-hidden bg-[#10131A]">
              <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1/2 bg-[#4C8DFF]/15" />
              <div aria-hidden="true" className="absolute inset-y-0 right-0 w-1/2 bg-[#FF8A3D]/15" />
              <div aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px -skew-x-12 bg-[#EEF1F6]/20" />

              <div className="relative flex h-full items-center justify-between px-6">
                <div className="flex flex-col items-center gap-1.5">
                  <Avatar initials={m.a.initials} tone="pro" size="lg" />
                  <span className="text-xs font-semibold text-[#EEF1F6]">{m.a.name}</span>
                </div>
                <span className="font-[family-name:var(--font-display)] text-2xl font-extrabold italic text-[#EEF1F6]/80">VS</span>
                <div className="flex flex-col items-center gap-1.5">
                  <Avatar initials={m.b.initials} tone="con" size="lg" />
                  <span className="text-xs font-semibold text-[#EEF1F6]">{m.b.name}</span>
                </div>
              </div>

              <span
                className={`absolute left-3 top-3 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                  m.status === "live" ? "bg-[#FF4D4D] text-white" : "bg-[#0B0D12]/80 text-[#C7CDD9]"
                }`}
              >
                {m.status === "live" ? "● Live" : "Final"}
              </span>
              <span className="absolute bottom-3 right-3 rounded-md bg-[#0B0D12]/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-[#EEF1F6]">
                {m.a.score} – {m.b.score}
              </span>
            </div>

            {/* Meta */}
            <div className="space-y-2 p-4">
              <p className="line-clamp-2 font-medium leading-snug text-[#EEF1F6]">{m.topic}</p>
              <div className="flex flex-wrap gap-1.5">
                {m.phrases.map((p) => (
                  <span key={p} className="rounded-md bg-[#1E2330] px-2 py-1 text-xs text-[#C7CDD9]">
                    {p}
                  </span>
                ))}
              </div>
              <p className="flex items-center gap-3 text-xs text-[#9AA3B5]">
                <span>{m.org}</span>
                <span className="flex items-center gap-1">
                  <Icon d={ICONS.eye} className="h-3.5 w-3.5" /> {m.viewers.toLocaleString()}
                </span>
              </p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

function DiscoveryFeed({ onQueue }: { onQueue: (label: string) => void }) {
  const [tab, setTab] = useState<FeedTab>("trending");
  const tabs: { id: FeedTab; label: string }[] = [
    { id: "trending", label: "Trending Topics" },
    { id: "featured", label: "Featured Matches" },
  ];

  return (
    <section aria-label="Discover" className="space-y-4">
      <div role="tablist" aria-label="Discovery feed" className="flex gap-6 border-b border-[#1E2330]">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`relative min-h-[44px] pb-3 font-[family-name:var(--font-display)] text-base font-bold transition-colors sm:text-lg ${
              tab === t.id ? "text-[#EEF1F6]" : "text-[#6B7489] hover:text-[#C7CDD9]"
            }`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#EEF1F6]" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "trending" ? <TrendingList onQueue={onQueue} /> : <FeaturedGrid />}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Queue toast (stand-in for real matchmaking)                        */
/* ------------------------------------------------------------------ */

function QueueToast({ label, onCancel }: { label: string; onCancel: () => void }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[#262C3B] bg-[#EEF1F6] p-3 pl-4 text-[#0B0D12] shadow-2xl">
      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[#2DD4BF]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Finding a match… {secs}s</span>
        <span className="block truncate text-xs text-[#4A5266]">{label}</span>
      </span>
      <button onClick={onCancel} aria-label="Cancel queue" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#D9DEE7]">
        <Icon d={ICONS.x} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("competitive");
  const [queued, setQueued] = useState<string | null>(null);
  const router = useRouter();
  const matchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show "Finding a match…" briefly, then drop into the Arena.
  // TODO: replace the timeout with a real Spacetime matchmaking callback.
  const handleQueue = (label: string) => {
    setQueued(`${mode === "competitive" ? "Ranked" : "Casual"} · ${label}`);
    if (matchTimer.current) clearTimeout(matchTimer.current);
    matchTimer.current = setTimeout(() => router.push("/arena"), 1800);
  };

  const cancelQueue = () => {
    if (matchTimer.current) clearTimeout(matchTimer.current);
    setQueued(null);
  };

  // Load the Arena in the background so the jump is instant.
  useEffect(() => {
    router.prefetch("/arena");
    return () => {
      if (matchTimer.current) clearTimeout(matchTimer.current);
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0B0D12] font-[family-name:var(--font-body)] text-[#EEF1F6]">
      <Header mode={mode} setMode={setMode} />

      <main className="mx-auto max-w-6xl space-y-8 px-4 pb-28 pt-5 sm:space-y-10 sm:pt-8">
        <HeroBanner mode={mode} onQueue={handleQueue} />

        {mode === "competitive" && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#3A3420] bg-[#1F1B10] px-4 py-3 text-sm text-[#E8D9A8]">
            <Icon d={ICONS.trophy} className="h-5 w-5 shrink-0 text-[#F5C451]" />
            <span>
              Ranked season ends in 12 days. You&apos;re <strong className="text-[#F5C451]">#14</strong> in the Zeta Pi bracket.
            </span>
          </div>
        )}

        <DiscoveryFeed onQueue={handleQueue} />
      </main>

      {queued && <QueueToast key={queued} label={queued} onCancel={cancelQueue} />}
    </div>
  );
}