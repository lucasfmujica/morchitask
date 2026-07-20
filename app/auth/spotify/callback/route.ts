import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { connectSpotify } from "@/lib/db/queries/spotify";

const TOKEN_URL = "https://accounts.spotify.com/api/token";

/**
 * Spotify OAuth callback. Validates the CSRF `state`, then swaps the `code`
 * for a refresh token directly (client secret lives in this server-only
 * route, never in the browser) and stores it. Lands the user back on the
 * Focus page. (Coexists with the Auth.js callback at /api/auth/callback —
 * different path, unrelated OAuth flow.)
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const cookieStore = await cookies();
  const expected = cookieStore.get("spotify_oauth_state")?.value;

  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${origin}/settings?error=${reason}`);
    res.cookies.delete("spotify_oauth_state");
    return res;
  };

  if (oauthError) return fail("spotify_denied");
  if (!code || !state || !expected || state !== expected) return fail("spotify_state");

  const session = await auth();
  if (!session?.user.id) return fail("spotify_unauthenticated");

  const basic =
    "Basic " +
    Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString(
      "base64",
    );
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/auth/spotify/callback`,
    }),
  });
  const tok = await res.json();
  if (!tok.refresh_token) {
    console.error("[spotify/callback] exchange_failed", JSON.stringify(tok));
    return fail("spotify_exchange");
  }

  await connectSpotify(session.user.id, tok.refresh_token, tok.scope ?? null);

  const okRes = NextResponse.redirect(`${origin}/focus`);
  okRes.cookies.delete("spotify_oauth_state");
  return okRes;
}
