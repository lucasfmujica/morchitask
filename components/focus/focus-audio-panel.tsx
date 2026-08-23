"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useAudio } from "@/lib/stores/audio";
import { getSoundscape } from "@/lib/audio/soundscapes";
import { cn } from "@/lib/utils";
import { FocusSoundPlayer } from "./focus-sound-player";
import { SpotifyPlayer } from "./spotify-player";

type Tab = "sounds" | "spotify";

/**
 * Audio, folded down to one row.
 *
 * The full panel — two tabs, eight soundscape tiles, a volume slider — sat
 * under the timer taking more vertical space than the timer itself, for a
 * setting you change about once a week. Collapsed, the row still says what's
 * playing and whether it follows the block; the panel is one tap away.
 */
export function FocusAudioPanel() {
  const [tab, setTab] = useState<Tab>("sounds");
  const [open, setOpen] = useState(false);

  const source = useAudio((s) => s.source);
  const playing = useAudio((s) => s.playing);
  const soundscape = getSoundscape(useAudio((s) => s.soundscapeId));
  const autoStart = useAudio((s) => s.autoStartWithFocus);

  const title = source === "spotify" ? "Spotify" : (soundscape?.label ?? "Sonidos de fondo");
  const subtitle = [
    autoStart ? "Arranca con el bloque" : "Manual",
    source === "spotify" ? "Spotify conectado" : "Spotify apagado",
  ].join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-2.5 text-left shadow-soft transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        <Equalizer active={playing} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{title}</span>
          <span className="block truncate text-2xs text-muted">{subtitle}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-subtle transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="flex flex-col items-center gap-4">
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
      )}
    </div>
  );
}

/** Four bars that move while something is playing, still when it isn't. */
function Equalizer({ active }: { active: boolean }) {
  return (
    <span className="flex h-4 shrink-0 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-pill",
            active ? "animate-pulse bg-primary" : "bg-border-strong",
          )}
          style={{
            height: active ? [10, 16, 7, 13][i] : 6,
            animationDelay: `${i * 120}ms`,
            animationDuration: "900ms",
          }}
        />
      ))}
    </span>
  );
}
