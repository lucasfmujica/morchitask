import { AudioLines, CloudRain, Coffee, Music, Waves, Wind, type LucideIcon } from "lucide-react";

/**
 * The catalog of focus sounds. Two kinds:
 *  - "synth": generated live in the browser with the Web Audio API (see
 *    `lib/audio/engine.ts`). Zero files, zero licensing, and they work offline.
 *  - "file": a real looping mp3 the user drops into `public/sounds/`. We ship
 *    none by default (can't bundle copyrighted music); a missing file renders as
 *    a "add a file" state instead of playing.
 */
export type SynthKind = "white" | "pink" | "brown" | "rain" | "wind" | "ocean";

export type Soundscape =
  | { id: string; label: string; kind: "synth"; synth: SynthKind; icon: LucideIcon }
  | { id: string; label: string; kind: "file"; file: string; icon: LucideIcon };

export const SOUNDSCAPES: Soundscape[] = [
  { id: "brown", label: "Ruido marrón", kind: "synth", synth: "brown", icon: AudioLines },
  { id: "pink", label: "Ruido rosa", kind: "synth", synth: "pink", icon: AudioLines },
  { id: "white", label: "Ruido blanco", kind: "synth", synth: "white", icon: AudioLines },
  { id: "rain", label: "Lluvia", kind: "synth", synth: "rain", icon: CloudRain },
  { id: "wind", label: "Viento", kind: "synth", synth: "wind", icon: Wind },
  { id: "ocean", label: "Olas del mar", kind: "synth", synth: "ocean", icon: Waves },
  { id: "lofi", label: "Lofi", kind: "file", file: "/sounds/lofi.mp3", icon: Music },
  { id: "cafe", label: "Cafetería", kind: "file", file: "/sounds/cafe.mp3", icon: Coffee },
];

export function getSoundscape(id: string | null | undefined): Soundscape | undefined {
  if (!id) return undefined;
  return SOUNDSCAPES.find((s) => s.id === id);
}
