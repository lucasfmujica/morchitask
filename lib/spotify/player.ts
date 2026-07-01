import { getSpotifyAccessToken } from "@/lib/queries/spotify";

/**
 * A module-level singleton that loads and owns the Spotify Web Playback SDK.
 * Lives outside React so playback survives navigation. Components subscribe to
 * snapshots and call the exported controls. The SDK requires Spotify Premium;
 * a free account surfaces as status "not_premium".
 */

export type SpotifyStatus = "loading" | "ready" | "not_premium" | "error" | "no_token";

export type SpotifySnapshot = {
  status: SpotifyStatus;
  paused: boolean;
  track: { name: string; artists: string; image: string | null } | null;
  deviceId: string | null;
};

// Minimal shapes for the parts of the SDK we use (no @types package installed).
type SdkTrack = {
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
};
type SdkState = { paused: boolean; track_window: { current_track: SdkTrack } };
interface WebPlaybackPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  togglePlay(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  pause(): Promise<void>;
  setVolume(v: number): Promise<void>;
  addListener(event: string, cb: (payload: unknown) => void): void;
}
interface SpotifyGlobal {
  Player: new (opts: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => WebPlaybackPlayer;
}
declare global {
  interface Window {
    Spotify?: SpotifyGlobal;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let player: WebPlaybackPlayer | null = null;
let deviceId: string | null = null;
let status: SpotifyStatus = "loading";
let paused = true;
let track: SpotifySnapshot["track"] = null;
let initStarted = false;
let scriptLoading = false;
const listeners = new Set<(s: SpotifySnapshot) => void>();

function snapshot(): SpotifySnapshot {
  return { status, paused, track, deviceId };
}
function emit() {
  const snap = snapshot();
  for (const l of listeners) l(snap);
}

export function subscribeSpotify(listener: (s: SpotifySnapshot) => void): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

function loadSdk(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve();
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    if (!scriptLoading) {
      scriptLoading = true;
      const s = document.createElement("script");
      s.src = "https://sdk.scdn.co/spotify-player.js";
      s.async = true;
      document.body.appendChild(s);
    }
  });
}

async function transferPlayback(id: string) {
  const token = await getSpotifyAccessToken();
  if (!token) return;
  await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ device_ids: [id], play: false }),
  }).catch(() => {});
}

export async function initSpotifyPlayer(): Promise<void> {
  if (initStarted) return;
  initStarted = true;
  await loadSdk();
  const Spotify = typeof window !== "undefined" ? window.Spotify : undefined;
  if (!Spotify) {
    status = "error";
    emit();
    return;
  }

  player = new Spotify.Player({
    name: "Morchitask",
    volume: 0.6,
    getOAuthToken: (cb) => {
      getSpotifyAccessToken().then((t) => {
        if (t) cb(t);
        else {
          status = "no_token";
          emit();
        }
      });
    },
  });

  player.addListener("ready", (payload) => {
    deviceId = (payload as { device_id: string }).device_id;
    status = "ready";
    emit();
    void transferPlayback(deviceId);
  });
  player.addListener("not_ready", () => {
    deviceId = null;
    emit();
  });
  player.addListener("player_state_changed", (payload) => {
    const s = payload as SdkState | null;
    if (!s) return;
    const cur = s.track_window?.current_track;
    paused = s.paused;
    track = cur
      ? {
          name: cur.name,
          artists: (cur.artists ?? []).map((a) => a.name).join(", "),
          image: cur.album?.images?.[0]?.url ?? null,
        }
      : null;
    emit();
  });

  const logError = (label: string) => (payload: unknown) => {
    console.error(`[spotify] ${label}`, payload);
  };
  player.addListener("initialization_error", logError("initialization_error"));
  player.addListener("authentication_error", (p) => {
    status = "error";
    emit();
    logError("authentication_error")(p);
  });
  player.addListener("account_error", (p) => {
    status = "not_premium";
    emit();
    logError("account_error")(p);
  });
  player.addListener("playback_error", logError("playback_error"));

  await player.connect();
}

export async function toggleSpotifyPlay() {
  await player?.togglePlay();
}
export async function spotifyNext() {
  await player?.nextTrack();
}
export async function spotifyPrevious() {
  await player?.previousTrack();
}
export async function spotifyPause() {
  await player?.pause();
}
export async function setSpotifyVolume(v: number) {
  await player?.setVolume(Math.max(0, Math.min(1, v)));
}

/** Start a playlist (or any context uri) on our device. */
export async function playSpotifyContext(contextUri: string) {
  const token = await getSpotifyAccessToken();
  if (!token || !deviceId) return;
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ context_uri: contextUri }),
  }).catch(() => {});
}

export function disconnectSpotifyPlayer() {
  player?.disconnect();
  player = null;
  deviceId = null;
  initStarted = false;
  status = "loading";
  paused = true;
  track = null;
  emit();
}
