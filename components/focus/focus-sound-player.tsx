"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SOUNDSCAPES, getSoundscape, type Soundscape } from "@/lib/audio/soundscapes";
import * as engine from "@/lib/audio/engine";
import { useAudio } from "@/lib/stores/audio";
import { cn } from "@/lib/utils";
import { Well } from "@/components/ui";
import { useTranslations } from "next-intl";

export function FocusSoundPlayer() {
  const t = useTranslations("focus");
  const soundscapeId = useAudio((s) => s.soundscapeId);
  const playing = useAudio((s) => s.playing);
  const volume = useAudio((s) => s.volume);
  const autoStart = useAudio((s) => s.autoStartWithFocus);
  const source = useAudio((s) => s.source);
  const setSoundscape = useAudio((s) => s.setSoundscape);
  const setPlaying = useAudio((s) => s.setPlaying);
  const setVolume = useAudio((s) => s.setVolume);
  const setAutoStart = useAudio((s) => s.setAutoStart);
  const setSource = useAudio((s) => s.setSource);

  // Which "file" soundscapes actually have their mp3 in /public/sounds.
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      SOUNDSCAPES.filter((s) => s.kind === "file").map(async (s) => {
        const ok = await engine.fileExists((s as Extract<Soundscape, { kind: "file" }>).file);
        return [s.id, ok] as const;
      }),
    ).then((pairs) => {
      if (!cancelled) setAvailable(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the engine's volume in sync.
  useEffect(() => {
    engine.setVolume(volume);
  }, [volume]);

  // Drive the engine from the store. Only this player owns the soundscape
  // engine; when Spotify takes over (source !== "soundscape") we suspend it.
  useEffect(() => {
    const sc = getSoundscape(soundscapeId);
    if (source !== "soundscape" || !playing || !sc) {
      engine.pause();
      return;
    }
    engine.play(sc);
  }, [playing, soundscapeId, source]);

  const isPlaying = playing && source === "soundscape";

  /** A tile picks its sound; tapping the one already on pauses or resumes it,
   *  which is what the separate play button used to do. */
  function onTile(id: string) {
    if (id !== soundscapeId) {
      setSoundscape(id);
      return;
    }
    if (source !== "soundscape") {
      setSource("soundscape");
      setPlaying(true);
      return;
    }
    setPlaying(!playing);
  }

  return (
    <Well
      className="flex animate-up flex-col gap-3 rounded-[28px] p-4"
      style={{ animationDelay: "160ms" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-fg">{t("audioTitle")}</h2>
        {/* The canvas shows this as a plain caption; it's the auto-start switch,
            so it says what it does and can be flipped where it's read. */}
        <button
          type="button"
          role="switch"
          aria-checked={autoStart}
          onClick={() => setAutoStart(!autoStart)}
          className="flex cursor-pointer items-center gap-2 text-2xs text-muted transition-colors hover:text-fg"
        >
          {t("audioAuto")}
          <span
            className={cn(
              "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
              autoStart ? "bg-primary" : "bg-border-strong",
            )}
            aria-hidden
          >
            <span
              className={cn(
                "inline-block h-3 w-3 rounded-full bg-surface shadow-soft transition-transform",
                autoStart ? "translate-x-3.5" : "translate-x-0.5",
              )}
            />
          </span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {SOUNDSCAPES.map((s) => {
          const selected = s.id === soundscapeId;
          const on = selected && isPlaying;
          const locked = s.kind === "file" && available[s.id] === false;
          return (
            <button
              key={s.id}
              onClick={() => onTile(s.id)}
              disabled={locked}
              aria-pressed={on}
              title={
                locked
                  ? t("soundMissingFile")
                  : selected
                    ? on
                      ? t("pauseSound")
                      : t("playSound")
                    : undefined
              }
              className={cn(
                "flex h-[72px] min-w-0 flex-col items-center justify-center gap-2 rounded-[18px] px-1 text-2xs font-semibold text-fg transition-colors duration-[250ms]",
                locked
                  ? "cursor-not-allowed bg-surface/60 text-subtle"
                  : selected
                    ? // Canvas #C3EDCF to #8FDCA4: the mint, lightened at the
                      // top-left corner. Dark ink stays on it in both themes.
                      "cursor-pointer bg-linear-135 from-[color-mix(in_srgb,var(--fit-from)_52%,white)] to-fit-from text-on-marker"
                    : "cursor-pointer bg-surface hover:bg-surface/70",
              )}
            >
              <Bars active={on} lit={selected && !locked} />
              <span className="max-w-full truncate">{t(s.labelKey)}</span>
              {locked && <span className="sr-only">{t("soundMissingFile")}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2.5">
        <label htmlFor="focus-volume" className="text-2xs font-semibold text-fg">
          {t("volume")}
        </label>
        <input
          id="focus-volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-pill [&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:w-[22px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-surface [&::-moz-range-thumb]:shadow-[0_2px_6px_rgb(var(--shadow-color)/calc(0.22*var(--shadow-strength)))] [&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgb(var(--shadow-color)/calc(0.22*var(--shadow-strength)))]"
          // The filled part of the track is the "fit" ramp, the rest the card:
          // a native accent-color can't take a gradient.
          style={{
            background: `linear-gradient(90deg, var(--color-fit-from) 0%, var(--color-primary) ${volume * 100}%, var(--color-surface) ${volume * 100}%)`,
          }}
        />
      </div>
    </Well>
  );
}

/** Four bars per tile: they move while that sound plays, and sit still in a
 *  rising row otherwise. */
function Bars({ active, lit }: { active: boolean; lit: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span className="flex h-3.5 items-end gap-0.5" aria-hidden>
      {[0, 1, 2, 3].map((k) => (
        <motion.span
          key={k}
          className={cn(
            "h-full w-[3px] origin-bottom rounded-[2px]",
            lit ? "bg-on-marker" : "bg-border-strong",
          )}
          initial={false}
          animate={active && !reduce ? { scaleY: [0.35, 1, 0.35] } : { scaleY: 0.4 + k * 0.15 }}
          transition={
            active && !reduce
              ? { duration: 1, ease: "easeInOut", repeat: Infinity, delay: k * 0.15 }
              : { duration: 0.3 }
          }
        />
      ))}
    </span>
  );
}
