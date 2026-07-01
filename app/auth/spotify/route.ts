import { NextResponse } from "next/server";

/**
 * Start the Spotify connect flow. This is a SECONDARY connection (not a login),
 * so we run our own Authorization Code flow instead of Supabase auth — the app's
 * Supabase session must stay intact. We stash a random `state` in an httpOnly
 * cookie for CSRF and send the user to Spotify's consent screen.
 */
const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-currently-playing",
].join(" ");

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(`${origin}/settings?error=spotify_config`);

  const redirectUri = `${origin}/auth/spotify/callback`;
  const state = crypto.randomUUID();

  const authorize = new URL("https://accounts.spotify.com/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", SCOPES);
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 600, // 10 minutes to complete consent
  });
  return res;
}
