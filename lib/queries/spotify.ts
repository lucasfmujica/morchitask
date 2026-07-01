import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { profileKeys, useMe } from "@/lib/queries/profiles";

/** Whether the current user has connected their Spotify account. */
export function useSpotifyConnected() {
  return !!useMe().data?.spotify_connected;
}

/** Kick off the Spotify OAuth flow (full-page redirect to our /auth/spotify route). */
export function connectSpotify() {
  window.location.href = "/auth/spotify";
}

/** Forget the connection: drop the stored token and clear the flag. */
export function useDisconnectSpotify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("spotify_credentials").delete().eq("owner_id", user.id);
      await supabase.from("profiles").update({ spotify_connected: false }).eq("id", user.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: profileKeys.me }),
  });
}

// A short-lived access token for the Web Playback SDK / Web API, cached in memory.
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Get a valid Spotify access token (from the edge function), cached until ~1 min before expiry. */
export async function getSpotifyAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.token;
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("spotify-auth", {
    body: { action: "token" },
  });
  if (error || !data?.access_token) return null;
  cachedToken = {
    token: data.access_token as string,
    expiresAt: Date.now() + ((data.expires_in as number) ?? 3600) * 1000,
  };
  return cachedToken.token;
}

/** Drop the cached token (call after disconnecting). */
export function clearSpotifyTokenCache() {
  cachedToken = null;
}

export type SpotifyPlaylist = {
  id: string;
  name: string;
  uri: string;
  images?: { url: string }[];
  tracks?: { total: number };
};

/** The user's playlists (Web API), enabled only when connected. */
export function useSpotifyPlaylists(enabled: boolean) {
  return useQuery({
    queryKey: ["spotify", "playlists"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SpotifyPlaylist[]> => {
      const token = await getSpotifyAccessToken();
      if (!token) return [];
      const res = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("spotify_playlists_failed");
      const json = await res.json();
      // Spotify occasionally returns null items in the playlists list — drop them.
      return ((json.items ?? []) as (SpotifyPlaylist | null)[]).filter(
        (pl): pl is SpotifyPlaylist => pl != null && typeof pl.id === "string",
      );
    },
  });
}
