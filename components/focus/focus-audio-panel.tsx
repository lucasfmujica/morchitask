"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FocusSoundPlayer } from "./focus-sound-player";
import { SpotifyPlayer } from "./spotify-player";

type Tab = "sounds" | "spotify";

/** The audio panel under the focus timer: built-in soundscapes or Spotify. */
export function FocusAudioPanel() {
  const [tab, setTab] = useState<Tab>("sounds");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
      <div className="flex gap-1 rounded-pill border border-border bg-surface-2 p-0.5">
        {(
          [
            ["sounds", "Sonidos"],
            ["spotify", "Spotify"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={cn(
              "cursor-pointer rounded-pill px-4 py-1.5 text-sm font-medium transition-colors",
              tab === value ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "sounds" ? <FocusSoundPlayer /> : <SpotifyPlayer />}
    </div>
  );
}
