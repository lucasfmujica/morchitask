"use client";

import { useState } from "react";
import { useAudio } from "@/lib/stores/audio";
import { connectSpotify, useSpotifyConnected } from "@/lib/queries/spotify";
import { cn } from "@/lib/utils";
import { FocusSoundPlayer } from "./focus-sound-player";
import { SpotifyPlayer } from "./spotify-player";
import { useTranslations } from "next-intl";

/**
 * Audio, as two blocks: the soundscapes laid out as tiles, and Spotify folded
 * into one row under them.
 *
 * It used to be a single collapsed row with tabs inside. That hid the sounds,
 * which you pick by ear and want to see side by side, behind two taps, while
 * Spotify (connected once, then driven from its own player) took a whole tab.
 * Now the sounds are always out and Spotify stays one row until you open it.
 */
export function FocusAudioPanel() {
  const t = useTranslations("focus");
  const connected = useSpotifyConnected();
  const source = useAudio((s) => s.source);
  const [open, setOpen] = useState(false);

  return (
    <>
      <FocusSoundPlayer />

      <div className="flex flex-col gap-2">
        <section className="flex items-center gap-2.5 rounded-pill bg-surface py-2 pr-2 pl-4 shadow-soft">
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              connected && source === "spotify"
                ? "bg-fit"
                : connected
                  ? "bg-primary"
                  : "bg-border-strong",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
            {connected ? t("spotifyOn") : t("spotifyOff")}
          </span>
          <button
            onClick={connected ? () => setOpen((o) => !o) : connectSpotify}
            aria-expanded={connected ? open : undefined}
            title={connected ? undefined : t("spotifyPitch")}
            className="h-9 shrink-0 cursor-pointer rounded-pill bg-surface-2 px-3.5 text-xs font-semibold text-fg transition-colors hover:bg-border"
          >
            {!connected ? t("spotifyConnect") : open ? t("spotifyClose") : t("spotifyOpen")}
          </button>
        </section>
        {connected && open && <SpotifyPlayer />}
      </div>
    </>
  );
}
