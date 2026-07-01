"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Pause, Play, Volume2 } from "lucide-react";
import { SOUNDSCAPES, getSoundscape, type Soundscape } from "@/lib/audio/soundscapes";
import * as engine from "@/lib/audio/engine";
import { useAudio } from "@/lib/stores/audio";
import { cn } from "@/lib/utils";

export function FocusSoundPlayer() {
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

  const selected = getSoundscape(soundscapeId);

  function onToggle() {
    if (!selected) {
      // Nothing picked yet — start the first synth soundscape.
      setSoundscape(SOUNDSCAPES[0].id);
      return;
    }
    if (source !== "soundscape") setSource("soundscape");
    setPlaying(!playing);
  }

  const isPlaying = playing && source === "soundscape";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          aria-label={isPlaying ? "Pausar sonido" : "Reproducir sonido"}
          className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-on-primary shadow-soft transition-colors hover:bg-primary-hover"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" aria-hidden />
          ) : (
            <Play className="ml-0.5 h-5 w-5" aria-hidden />
          )}
        </button>

        <SoundscapePicker
          value={soundscapeId}
          available={available}
          onChange={(id) => setSoundscape(id)}
        />
      </div>

      <div className="flex items-center gap-3 px-1">
        <Volume2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volumen"
          className="h-1.5 w-full cursor-pointer"
          style={{ accentColor: "var(--color-primary)" }}
        />
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 px-1 text-sm">
        <span className="text-muted">Empezar con el foco</span>
        <button
          type="button"
          role="switch"
          aria-checked={autoStart}
          onClick={() => setAutoStart(!autoStart)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
            autoStart ? "bg-primary" : "bg-surface-2 border border-border",
          )}
        >
          <span
            className={cn(
              "inline-block h-3.5 w-3.5 rounded-full bg-surface shadow-soft transition-transform",
              autoStart ? "translate-x-[18px]" : "translate-x-1",
            )}
          />
        </button>
      </label>
    </div>
  );
}

/** Soundscape dropdown — same visual language as the TaskPicker in focus-timer. */
function SoundscapePicker({
  value,
  available,
  onChange,
}: {
  value: string | null;
  available: Record<string, boolean>;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const selected = getSoundscape(value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isLocked = (s: Soundscape) => s.kind === "file" && available[s.id] === false;

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Elegí un sonido"
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-xl border bg-surface px-3.5 py-2.5 text-left text-sm shadow-soft transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
          open ? "border-primary" : "border-border hover:bg-surface-2",
        )}
      >
        {selected ? (
          <>
            <selected.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-fg">{selected.label}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted">Elegí un sonido…</span>
        )}
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 z-20 mt-2 max-h-64 origin-top overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-card"
          >
            {SOUNDSCAPES.map((s) => {
              const active = s.id === value;
              const locked = isLocked(s);
              return (
                <li key={s.id} role="option" aria-selected={active}>
                  <button
                    disabled={locked}
                    onClick={() => {
                      if (locked) return;
                      onChange(s.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      locked
                        ? "cursor-not-allowed text-subtle"
                        : active
                          ? "cursor-pointer bg-primary-soft text-primary"
                          : "cursor-pointer text-fg hover:bg-surface-2",
                    )}
                  >
                    <s.icon
                      className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted")}
                      aria-hidden
                    />
                    <span className={cn("min-w-0 flex-1 truncate", active && "font-medium")}>
                      {s.label}
                    </span>
                    {locked && (
                      <span className="shrink-0 text-xs text-subtle">Agregá el archivo</span>
                    )}
                    {active && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
