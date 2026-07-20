import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSpotifyCredentials, updateSpotifyRefreshToken } from "@/lib/db/queries/spotify";

const TOKEN_URL = "https://accounts.spotify.com/api/token";

function basicAuth() {
  return (
    "Basic " +
    Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString(
      "base64",
    )
  );
}

/** Mints a short-lived Spotify access token for the Web Playback SDK from the stored refresh token. */
export async function POST() {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cred = await getSpotifyCredentials(session.user.id);
  if (!cred?.refresh_token) return NextResponse.json({ error: "not_connected" }, { status: 400 });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cred.refresh_token }),
  });
  const tok = await res.json();
  if (!tok.access_token) {
    console.error("[spotify/token] token_refresh_failed", JSON.stringify(tok));
    return NextResponse.json({ error: "token_refresh_failed", detail: tok }, { status: 502 });
  }
  // Spotify occasionally rotates the refresh token — persist the new one.
  if (tok.refresh_token && tok.refresh_token !== cred.refresh_token) {
    await updateSpotifyRefreshToken(session.user.id, tok.refresh_token);
  }
  return NextResponse.json({ access_token: tok.access_token, expires_in: tok.expires_in ?? 3600 });
}
