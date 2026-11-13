export type GoogleTokenResult =
  | { ok: true; accessToken: string }
  /** `revoked`: Google will never accept this refresh token again (the person
   *  removed access, changed their password, or it expired unused). Anything
   *  else might work on a retry. */
  | { ok: false; revoked: boolean };

/**
 * Whether a failed refresh means the grant is gone for good.
 *
 * `invalid_grant` is what Google answers once the refresh token is dead. It
 * used to be treated like any other failure, a 502, so the profile still said
 * "connected": Settings never offered to connect again, and every calendar
 * view kept asking for events and erroring, indefinitely.
 */
export function isRevokedGrant(body: unknown): boolean {
  return (
    !!body && typeof body === "object" && (body as { error?: unknown }).error === "invalid_grant"
  );
}

/** Exchanges a stored Google refresh token for a short-lived access token. */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResult> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json().catch(() => null);
  if (typeof json?.access_token === "string") return { ok: true, accessToken: json.access_token };
  return { ok: false, revoked: isRevokedGrant(json) };
}
