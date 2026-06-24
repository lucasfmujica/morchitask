import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback: exchanges the `code` for a session. When the user connected
 * Google Calendar (offline access), we also capture the refresh token so the
 * edge functions can act on their calendar later.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/today";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // Present only when consent requested offline access (calendar connect).
      const refreshToken = data.session?.provider_refresh_token;
      if (refreshToken) {
        // Store via a SECURITY DEFINER RPC: right after the OAuth exchange the
        // request's auth.uid() isn't populated, so a direct RLS-checked insert
        // is rejected. The RPC stores the token and flips the connected flag,
        // and still blocks a normal client from writing another user's row.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: credErr } = await (supabase as any).rpc("connect_google_calendar", {
          p_owner_id: data.user.id,
          p_refresh_token: refreshToken,
        });
        if (credErr) {
          console.error("[auth/callback] connect_google_calendar failed:", credErr.message);
        }
      } else {
        console.warn("[auth/callback] no provider_refresh_token returned (calendar not stored)");
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
