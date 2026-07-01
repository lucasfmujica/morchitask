// Spotify OAuth broker — mirrors the Google Calendar token flow.
// The client secret lives here (edge-function secret), never in the browser.
//   action "exchange": swap the OAuth `code` for tokens and store the refresh
//                       token (service role) via the connect_spotify RPC.
//   action "token":     mint a short-lived access token for the Web Playback SDK
//                       from the stored refresh token.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN_URL = "https://accounts.spotify.com/api/token";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID")!;
    const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
    const basic = "Basic " + btoa(`${clientId}:${clientSecret}`);
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, service);
    const body = await req.json().catch(() => ({}));
    const action = body.action as "exchange" | "token" | undefined;

    // --- exchange: authorization code -> refresh token (store it) ---
    if (action === "exchange") {
      const code = body.code as string | undefined;
      const redirectUri = body.redirectUri as string | undefined;
      if (!code || !redirectUri) return json({ error: "bad_request" }, 400);

      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });
      const tok = await res.json();
      if (!tok.refresh_token) {
        console.error("[spotify-auth] exchange_failed", JSON.stringify(tok));
        return json({ error: "exchange_failed", detail: tok }, 502);
      }
      const { error: rpcErr } = await admin.rpc("connect_spotify", {
        p_owner_id: user.id,
        p_refresh_token: tok.refresh_token,
        p_scope: tok.scope ?? null,
      });
      if (rpcErr) {
        console.error("[spotify-auth] connect_spotify failed", rpcErr.message);
        return json({ error: "store_failed" }, 500);
      }
      return json({ ok: true });
    }

    // --- token: refresh token -> short-lived access token ---
    if (action === "token") {
      const { data: cred } = await admin
        .from("spotify_credentials")
        .select("refresh_token")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!cred?.refresh_token) return json({ error: "not_connected" }, 400);

      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: cred.refresh_token,
        }),
      });
      const tok = await res.json();
      if (!tok.access_token) {
        console.error("[spotify-auth] token_refresh_failed", JSON.stringify(tok));
        return json({ error: "token_refresh_failed", detail: tok }, 502);
      }
      // Spotify occasionally rotates the refresh token — persist the new one.
      if (tok.refresh_token && tok.refresh_token !== cred.refresh_token) {
        await admin
          .from("spotify_credentials")
          .update({ refresh_token: tok.refresh_token, updated_at: new Date().toISOString() })
          .eq("owner_id", user.id);
      }
      return json({ access_token: tok.access_token, expires_in: tok.expires_in ?? 3600 });
    }

    return json({ error: "bad_action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
