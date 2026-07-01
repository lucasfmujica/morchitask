import { describe, it, expect, beforeEach, vi } from "vitest";

// The store is persisted; give it an in-memory localStorage in the test env.
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
});

const { useAudio } = await import("./audio");

const initial = {
  soundscapeId: null,
  playing: false,
  volume: 0.6,
  autoStartWithFocus: true,
  source: "off" as const,
};

describe("useAudio store", () => {
  beforeEach(() => {
    useAudio.setState(initial);
  });

  it("setSoundscape selects it, starts playing, and claims the source", () => {
    useAudio.getState().setSoundscape("rain");
    const s = useAudio.getState();
    expect(s.soundscapeId).toBe("rain");
    expect(s.playing).toBe(true);
    expect(s.source).toBe("soundscape");
  });

  it("toggle flips the playing flag", () => {
    expect(useAudio.getState().playing).toBe(false);
    useAudio.getState().toggle();
    expect(useAudio.getState().playing).toBe(true);
    useAudio.getState().toggle();
    expect(useAudio.getState().playing).toBe(false);
  });

  it("setVolume clamps to [0, 1]", () => {
    useAudio.getState().setVolume(2);
    expect(useAudio.getState().volume).toBe(1);
    useAudio.getState().setVolume(-0.5);
    expect(useAudio.getState().volume).toBe(0);
    useAudio.getState().setVolume(0.3);
    expect(useAudio.getState().volume).toBe(0.3);
  });

  it("setAutoStart and setSource update their fields", () => {
    useAudio.getState().setAutoStart(false);
    expect(useAudio.getState().autoStartWithFocus).toBe(false);
    useAudio.getState().setSource("spotify");
    expect(useAudio.getState().source).toBe("spotify");
  });
});
