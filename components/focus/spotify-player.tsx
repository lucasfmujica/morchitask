"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ListMusic,
  Music,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from "lucide-react";
import {
  connectSpotify,
  useSpotifyConnected,
  useSpotifyPlaylists,
  useSpotifyPlaylistTracks,
  useSpotifySearch,
  type SpotifyPlaylist,
  type SpotifyTrack,
} from "@/lib/queries/spotify";
import {
  initSpotifyPlayer,
  playSpotifyContext,
  playSpotifyUris,
  setSpotifyVolume,
  spotifyNext,
  spotifyPrevious,
  subscribeSpotify,
  toggleSpotifyPlay,
  type SpotifySnapshot,
} from "@/lib/spotify/player";
import { useAudio } from "@/lib/stores/audio";
import { cn } from "@/lib/utils";

export function SpotifyPlayer() {
  const connected = useSpotifyConnected();
  const setSource = useAudio((s) => s.setSource);
  const setAudioPlaying = useAudio((s) => s.setPlaying);
  const [snap, setSnap] = useState<SpotifySnapshot>({
    status: "loading",
    paused: true,
    track: null,
    deviceId: null,
  });
  const [volume, setVol] = useState(0.6);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null);

  // Debounced search box.
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);
  const searching = debounced.trim().length >= 2;

  const playlistsQ = useSpotifyPlaylists(connected);
  const playlistTracksQ = useSpotifyPlaylistTracks(selectedPlaylist?.id ?? null);
  const searchQ = useSpotifySearch(debounced);

  useEffect(() => {
    if (!connected) return;
    const unsub = subscribeSpotify(setSnap);
    void initSpotifyPlayer();
    return unsub;
  }, [connected]);

  // Take over audio from the built-in soundscapes and start something.
  function claimAndPlay(fn: () => Promise<void>) {
    setSource("spotify");
    setAudioPlaying(false);
    void fn();
  }

  if (!connected) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Music className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">Spotify</p>
            <p className="text-xs text-muted">
              Reproducí tus playlists mientras te concentrás. Necesitás Spotify Premium.
            </p>
          </div>
        </div>
        <button
          onClick={connectSpotify}
          className="w-fit cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Conectar Spotify
        </button>
      </div>
    );
  }

  if (snap.status === "not_premium") {
    return (
      <PlayerShell>
        <p className="text-sm text-muted">
          Tu cuenta de Spotify no es <span className="font-medium text-fg">Premium</span>. La
          reproducción dentro de la app solo funciona con Premium.
        </p>
      </PlayerShell>
    );
  }

  if (snap.status === "error" || snap.status === "no_token") {
    return (
      <PlayerShell>
        <p className="text-sm text-muted">
          No pudimos conectar con Spotify. Probá{" "}
          <button
            onClick={connectSpotify}
            className="cursor-pointer font-medium text-primary underline"
          >
            reconectar
          </button>
          .
        </p>
      </PlayerShell>
    );
  }

  return (
    <PlayerShell>
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
          {snap.track?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snap.track.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted">
              <Music className="h-5 w-5" aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">
            {snap.track?.name ?? (snap.status === "loading" ? "Conectando…" : "Elegí una canción")}
          </p>
          <p className="truncate text-xs text-muted">{snap.track?.artists ?? ""}</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => spotifyPrevious()}
          aria-label="Anterior"
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <SkipBack className="h-5 w-5" aria-hidden />
        </button>
        <button
          onClick={() => {
            setSource("spotify");
            void toggleSpotifyPlay();
          }}
          aria-label={snap.paused ? "Reproducir" : "Pausar"}
          className="inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-primary text-on-primary shadow-soft transition-colors hover:bg-primary-hover"
        >
          {snap.paused ? (
            <Play className="ml-0.5 h-5 w-5" aria-hidden />
          ) : (
            <Pause className="h-5 w-5" aria-hidden />
          )}
        </button>
        <button
          onClick={() => spotifyNext()}
          aria-label="Siguiente"
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <SkipForward className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-3 px-1">
        <Volume2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVol(v);
            void setSpotifyVolume(v);
          }}
          aria-label="Volumen de Spotify"
          className="h-1.5 w-full cursor-pointer"
          style={{ accentColor: "var(--color-primary)" }}
        />
      </div>

      {/* Search box */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar canción o artista…"
          aria-label="Buscar canción o artista"
          className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-9 text-sm text-fg shadow-soft outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-focus"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {searching ? (
        <TrackList
          tracks={searchQ.data ?? []}
          loading={searchQ.isLoading}
          empty="No encontramos canciones."
          currentName={snap.track?.name}
          onPick={(t) => claimAndPlay(() => playSpotifyUris([t.uri]))}
        />
      ) : (
        <>
          <PlaylistPicker
            playlists={playlistsQ.data ?? []}
            loading={playlistsQ.isLoading}
            selectedId={selectedPlaylist?.id ?? null}
            onPick={(pl) => {
              setSelectedPlaylist(pl);
              claimAndPlay(() => playSpotifyContext(pl.uri));
            }}
          />
          {selectedPlaylist && (
            <TrackList
              tracks={playlistTracksQ.data ?? []}
              loading={playlistTracksQ.isLoading}
              empty="Esta playlist no tiene canciones."
              currentName={snap.track?.name}
              onPick={(t) => claimAndPlay(() => playSpotifyContext(selectedPlaylist.uri, t.uri))}
            />
          )}
        </>
      )}
    </PlayerShell>
  );
}

function PlayerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      {children}
    </div>
  );
}

/** A scrollable list of tracks (playlist contents or search results). */
function TrackList({
  tracks,
  loading,
  empty,
  currentName,
  onPick,
}: {
  tracks: SpotifyTrack[];
  loading: boolean;
  empty: string;
  currentName?: string;
  onPick: (t: SpotifyTrack) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3 text-sm text-subtle">
        Cargando canciones…
      </div>
    );
  }
  if (tracks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3 text-sm text-subtle">
        {empty}
      </div>
    );
  }
  return (
    <ul className="max-h-60 overflow-y-auto rounded-xl border border-border bg-surface p-1">
      {tracks.map((t) => {
        const active = !!currentName && t.name === currentName;
        return (
          <li key={t.id}>
            <button
              onClick={() => onPick(t)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                active ? "bg-primary-soft" : "hover:bg-surface-2",
              )}
            >
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-surface-2">
                {t.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted">
                    <Music className="h-4 w-4" aria-hidden />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm",
                    active ? "font-medium text-primary" : "text-fg",
                  )}
                >
                  {t.name}
                </span>
                <span className="block truncate text-xs text-muted">{t.artists}</span>
              </span>
              {active && <Play className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Playlist dropdown — same visual language as the other Focus pickers. */
function PlaylistPicker({
  playlists,
  loading,
  selectedId,
  onPick,
}: {
  playlists: SpotifyPlaylist[];
  loading: boolean;
  selectedId: string | null;
  onPick: (pl: SpotifyPlaylist) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const picked = playlists.find((p) => p.id === selectedId);

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

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-xl border bg-surface px-3.5 py-2.5 text-left text-sm shadow-soft transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
          open ? "border-primary" : "border-border hover:bg-surface-2",
        )}
      >
        <ListMusic className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-fg">
          {picked ? picked.name : "Elegí una playlist…"}
        </span>
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
            className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-64 origin-bottom overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-card"
          >
            {loading && <li className="px-2.5 py-2 text-sm text-subtle">Cargando playlists…</li>}
            {!loading && playlists.length === 0 && (
              <li className="px-2.5 py-2 text-sm text-subtle">No encontramos playlists.</li>
            )}
            {playlists.map((pl) => {
              const active = pl.id === selectedId;
              return (
                <li key={pl.id} role="option" aria-selected={active}>
                  <button
                    onClick={() => {
                      onPick(pl);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      active ? "bg-primary-soft text-primary" : "text-fg hover:bg-surface-2",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{pl.name}</span>
                    <span className="shrink-0 text-xs text-subtle">{pl.tracks?.total ?? 0}</span>
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
