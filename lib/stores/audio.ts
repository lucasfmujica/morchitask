import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Focus-sound preferences/intent, persisted to localStorage so the chosen
 * soundscape and volume survive reloads and navigation. This is the source of
 * truth; the player component subscribes and drives the audio engine
 * (`lib/audio/engine.ts`), which holds the actual (non-serializable) nodes.
 *
 * `source` records which player currently owns audio, so the built-in
 * soundscapes and Spotify never play over each other.
 */
export type AudioSource = "off" | "soundscape" | "spotify";

type State = {
  soundscapeId: string | null;
  playing: boolean;
  volume: number; // 0..1
  autoStartWithFocus: boolean;
  source: AudioSource;
  setSoundscape: (id: string) => void;
  setPlaying: (playing: boolean) => void;
  toggle: () => void;
  setVolume: (volume: number) => void;
  setAutoStart: (autoStartWithFocus: boolean) => void;
  setSource: (source: AudioSource) => void;
};

const clampVolume = (v: number) => Math.max(0, Math.min(1, v));

export const useAudio = create<State>()(
  persist(
    (set) => ({
      soundscapeId: null,
      playing: false,
      volume: 0.6,
      autoStartWithFocus: true,
      source: "off",
      setSoundscape: (id) => set({ soundscapeId: id, playing: true, source: "soundscape" }),
      setPlaying: (playing) => set({ playing }),
      toggle: () => set((s) => ({ playing: !s.playing })),
      setVolume: (volume) => set({ volume: clampVolume(volume) }),
      setAutoStart: (autoStartWithFocus) => set({ autoStartWithFocus }),
      setSource: (source) => set({ source }),
    }),
    {
      name: "morchitask:audio",
      // Persist only preferences, not transient playback intent — a reload
      // shouldn't blast sound before the user interacts (autoplay policy).
      partialize: (s) => ({
        soundscapeId: s.soundscapeId,
        volume: s.volume,
        autoStartWithFocus: s.autoStartWithFocus,
      }),
    },
  ),
);
