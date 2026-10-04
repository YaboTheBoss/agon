"use client";

import type { Mode } from "@/lib/data";
import { usePlayMode } from "@/lib/play-mode";
import { Icon } from "@/components/ui";

export default function ModeSwitch() {
  const { mode, setMode } = usePlayMode();
  return (
    <div role="group" aria-label="Play mode" className="mode-switch flex shrink-0 rounded-full border-2 border-[#1E1B2E] bg-white p-0.5 shadow-[2px_2px_0_#1E1B2E]">
      {(["casual", "comp"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => setMode(m)}
          className={`relative min-h-[36px] rounded-full px-3 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD43B] ${m === "comp" ? "flex items-center gap-1" : ""} ${
            mode === m ? (m === "casual" ? "bg-[#7EE0B5] text-[#1E1B2E]" : "bg-[#1E1B2E] text-[#FFD43B]") : "text-[#5E5A72]"
          }`}
        >
          {m === "comp" && (
            <Icon name="bolt" strokeWidth={2.6} className="h-3.5 w-3.5 shrink-0" />
          )}
          {m === "casual" ? "Casual" : "Comp"}
        </button>
      ))}
    </div>
  );
}
