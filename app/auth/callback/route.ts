import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback: exchanges the `code` for a session. When the user connected
 * Google Calendar (offline access), we also capture the refresh token so the
 * edge function can read their calendar later.
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
        // delete + insert (avoids any ON CONFLICT/RLS quirk of upsert).
        await supabase.from("google_credentials").delete().eq("owner_id", data.user.id);
        const { error: credErr } = await supabase
          .from("google_credentials")
          .insert({ owner_id: data.user.id, refresh_token: refreshToken });
        if (credErr) {
          console.error("[auth/callback] google_credentials insert failed:", credErr.message);
        } else {
          await supabase
            .from("profiles")
            .update({ google_calendar_connected: true })
            .eq("id", data.user.id);
        }
      } else {
        console.warn("[auth/callback] no provider_refresh_token returned (calendar not stored)");
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
