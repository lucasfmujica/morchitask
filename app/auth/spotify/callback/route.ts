import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Spotify OAuth callback. Validates the CSRF `state`, then hands the `code` to
 * the `spotify-auth` edge function (action "exchange"), which owns the client
 * secret and stores the refresh token. Lands the user back on the Focus page.
 * (Coexists with the Supabase auth callback at /auth/callback — different path.)
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

  const supabase = await createClient();
  const { error } = await supabase.functions.invoke("spotify-auth", {
    body: { action: "exchange", code, redirectUri: `${origin}/auth/spotify/callback` },
  });
  if (error) return fail("spotify_exchange");

  const res = NextResponse.redirect(`${origin}/focus`);
  res.cookies.delete("spotify_oauth_state");
  return res;
}
