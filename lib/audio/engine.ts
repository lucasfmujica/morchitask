import { type Soundscape, type SynthKind } from "./soundscapes";

/**
 * The focus-sound engine: a single module-level singleton that lives OUTSIDE
 * React so playback survives client-side navigation. It owns one AudioContext
 * and one master GainNode (the volume). The Zustand store (`lib/stores/audio.ts`)
 * holds the serializable intent; a thin effect in the player component drives
 * this engine from that store.
 *
 * Synth soundscapes are built from generated noise buffers (no files); "file"
 * soundscapes loop an <audio> element routed through the same master gain.
 */

// ---------------------------------------------------------------------------
// Pure noise generators — no AudioContext, so these are unit-testable.
// ---------------------------------------------------------------------------

/** Which base noise a synth soundscape is built from before filtering. */
export function baseNoiseFor(synth: SynthKind): "white" | "pink" | "brown" {
  switch (synth) {
    case "white":
      return "white";
    case "pink":
      return "pink";
    case "brown":
    case "wind":
    case "ocean":
      return "brown";
    case "rain":
      return "white";
  }
}

/**
 * Fill a Float32Array with noise in [-1, 1]. Uses well-known algorithms:
 * brown = integrated white (leaky), pink = Paul Kellet's refined filter.
 */
export function generateNoiseSamples(
  kind: "white" | "pink" | "brown",
  length: number,
): Float32Array {
  const out = new Float32Array(length);
  if (kind === "white") {
    for (let i = 0; i < length; i++) out[i] = Math.random() * 2 - 1;
    return out;
  }
  if (kind === "brown") {
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      let v = last * 3.5; // restore perceived volume
      if (v > 1) v = 1;
      else if (v < -1) v = -1;
      out[i] = v;
    }
    return out;
  }
  // pink
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    let pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    if (pink > 1) pink = 1;
    else if (pink < -1) pink = -1;
    out[i] = pink;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The engine (browser-only, AudioContext-backed).
// ---------------------------------------------------------------------------

type Nodes = {
  source?: AudioBufferSourceNode;
  filter?: BiquadFilterNode;
  lfo?: OscillatorNode;
  lfoGain?: GainNode;
  scGain?: GainNode;
  ampLfo?: OscillatorNode;
  ampLfoDepth?: GainNode;
  audioEl?: HTMLAudioElement;
  mediaSrc?: MediaElementAudioSourceNode;
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let nodes: Nodes = {};
let currentId: string | null = null;
let volume = 0.6;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** Build a seamless looping noise buffer (short seam crossfade kills the tick). */
function makeLoopBuffer(context: AudioContext, kind: "white" | "pink" | "brown", seconds: number) {
  const length = Math.floor(context.sampleRate * seconds);
  const data = generateNoiseSamples(kind, length);
  const fade = Math.min(Math.floor(context.sampleRate * 0.05), Math.floor(length / 4));
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    data[i] = data[i] * t + data[length - fade + i] * (1 - t);
  }
  const buffer = context.createBuffer(1, length, context.sampleRate);
  buffer.getChannelData(0).set(data);
  return buffer;
}

function teardown() {
  try {
    nodes.source?.stop();
  } catch {
    // already stopped
  }
  try {
    nodes.lfo?.stop();
  } catch {
    /* noop */
  }
  try {
    nodes.ampLfo?.stop();
  } catch {
    /* noop */
  }
  nodes.source?.disconnect();
  nodes.filter?.disconnect();
  nodes.lfo?.disconnect();
  nodes.lfoGain?.disconnect();
  nodes.scGain?.disconnect();
  nodes.ampLfo?.disconnect();
  nodes.ampLfoDepth?.disconnect();
  if (nodes.audioEl) {
    nodes.audioEl.pause();
    nodes.mediaSrc?.disconnect();
  }
  nodes = {};
  currentId = null;
}

function buildSynth(
  context: AudioContext,
  out: GainNode,
  sc: Extract<Soundscape, { kind: "synth" }>,
) {
  const source = context.createBufferSource();
  source.buffer = makeLoopBuffer(context, baseNoiseFor(sc.synth), 10);
  source.loop = true;

  const scGain = context.createGain();
  scGain.gain.value = 1;

  let tail: AudioNode = source;

  if (sc.synth === "rain" || sc.synth === "wind" || sc.synth === "ocean") {
    const filter = context.createBiquadFilter();
    if (sc.synth === "rain") {
      filter.type = "bandpass";
      filter.frequency.value = 1400;
      filter.Q.value = 0.5;
    } else {
      // wind / ocean — a low, moving rumble
      filter.type = "lowpass";
      filter.frequency.value = 500;
      filter.Q.value = 0.3;
      const lfo = context.createOscillator();
      lfo.frequency.value = sc.synth === "ocean" ? 0.1 : 0.05;
      const lfoGain = context.createGain();
      lfoGain.gain.value = 250; // sweep the cutoff ±250 Hz
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start();
      nodes.lfo = lfo;
      nodes.lfoGain = lfoGain;
    }
    source.connect(filter);
    filter.connect(scGain);
    tail = scGain;
    nodes.filter = filter;
  } else {
    source.connect(scGain);
    tail = scGain;
  }

  if (sc.synth === "ocean") {
    // Amplitude "wash" in and out.
    const ampLfo = context.createOscillator();
    ampLfo.frequency.value = 0.1;
    const ampLfoDepth = context.createGain();
    ampLfoDepth.gain.value = 0.35;
    scGain.gain.value = 0.65;
    ampLfo.connect(ampLfoDepth).connect(scGain.gain);
    ampLfo.start();
    nodes.ampLfo = ampLfo;
    nodes.ampLfoDepth = ampLfoDepth;
  }

  tail.connect(out);
  source.start();
  nodes.source = source;
  nodes.scGain = scGain;
}

function buildFile(
  context: AudioContext,
  out: GainNode,
  sc: Extract<Soundscape, { kind: "file" }>,
) {
  const el = new Audio(sc.file);
  el.loop = true;
  el.crossOrigin = "anonymous";
  const mediaSrc = context.createMediaElementSource(el);
  mediaSrc.connect(out);
  void el.play().catch(() => {
    /* autoplay blocked until a user gesture — resume() retries */
  });
  nodes.audioEl = el;
  nodes.mediaSrc = mediaSrc;
}

/** Start (or switch to) a soundscape. Safe to call repeatedly. */
export function play(sc: Soundscape) {
  const context = ensureCtx();
  if (!context || !master) return;
  void context.resume();
  if (currentId === sc.id && (nodes.source || nodes.audioEl)) return; // already playing it
  teardown();
  if (sc.kind === "synth") buildSynth(context, master, sc);
  else buildFile(context, master, sc);
  currentId = sc.id;
}

/** Pause without tearing nodes down, so resume() is instant. */
export function pause() {
  if (!ctx) return;
  void ctx.suspend();
  nodes.audioEl?.pause();
}

export function resume() {
  if (!ctx) return;
  void ctx.resume();
  void nodes.audioEl?.play().catch(() => {});
}

/** Stop everything and forget the current soundscape. */
export function stop() {
  teardown();
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
}

export function currentSoundscapeId() {
  return currentId;
}

/** Best-effort probe: does a "file" soundscape's mp3 actually exist? */
export async function fileExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}
