/**
 * What we ask Google for, and what we keep from what it gives back.
 *
 * Signing in and connecting Google Calendar are two separate grants. Calendar
 * scopes are "sensitive" in Google's terms: while sign-in asked for them, every
 * new account hit Google's unverified-app wall ("Error 403: access_denied")
 * before it could even log in. So sign-in asks for identity only, and Calendar
 * is requested on its own, from Settings, as an incremental grant.
 *
 * The other half is the part that can hurt the people already using the app:
 * a sign-in now returns a token that cannot read their calendar. Every Google
 * token response goes through `decideGoogleGrant`, which only lets one replace
 * the stored Calendar grant when it actually carries Calendar access.
 */

export const BASIC_SCOPES = ["openid", "email", "profile"] as const;

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

/**
 * The provider's default authorization params, i.e. a plain sign-in.
 *
 * No `access_type: offline`: logging in needs no refresh token, and the Calendar
 * code is the only thing that uses one. No `prompt: consent` either: it forced
 * the full consent screen on every login, which is what used to hand back a new
 * refresh token each time (and what the old callback relied on).
 */
export const SIGN_IN_AUTHORIZATION_PARAMS = {
  scope: BASIC_SCOPES.join(" "),
} as const;

/**
 * Passed as the third argument of `signIn("google", …)` when someone connects
 * the calendar. They override the provider defaults above for that one request.
 *
 * - The basic scopes stay in: Google is an OIDC provider for Auth.js, and
 *   without `openid` the callback gets no id_token to identify the person by.
 * - `include_granted_scopes` makes the new grant a superset of what they already
 *   gave us, rather than a separate token with only Calendar in it.
 * - `access_type: offline` + `prompt: consent` are what make Google return a
 *   refresh token; without `prompt` it only does so the very first time.
 */
export const CALENDAR_AUTHORIZATION_PARAMS = {
  scope: [...BASIC_SCOPES, ...CALENDAR_SCOPES].join(" "),
  access_type: "offline",
  prompt: "consent",
  include_granted_scopes: "true",
} as const;

/** Google returns the granted scopes space-separated, in any order. */
export function grantedScopes(scope: string | null | undefined): Set<string> {
  return new Set((scope ?? "").split(/\s+/).filter(Boolean));
}

/**
 * Both Calendar scopes, not either. With only `calendar.readonly` the agenda
 * would load and every "send to calendar" would fail with a 403, which is a
 * worse state than plainly not connected. Google's consent screen lets people
 * untick each one separately, so a partial grant is a real outcome.
 */
export function hasCalendarScopes(scope: string | null | undefined): boolean {
  const granted = grantedScopes(scope);
  return CALENDAR_SCOPES.every((s) => granted.has(s));
}

/** The token fields Auth.js hands the `signIn` callback, as far as we read them. */
export type GoogleAccount = {
  provider: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  scope?: string | null;
};

export type GrantDecision =
  | {
      action: "store";
      tokens: {
        refresh_token: string;
        access_token: string | null;
        expires_at: number | null;
        scope: string;
      };
    }
  | { action: "keep"; reason: "not-google" | "no-calendar-scope" | "no-refresh-token" };

/**
 * Whether a Google sign-in should overwrite the stored Calendar tokens and mark
 * the calendar connected. "keep" means touch nothing: not the tokens, not the
 * connected flag.
 *
 * The rule is about the token, not about which button was pressed, because the
 * callback cannot tell a plain login from a connect where someone unticked the
 * Calendar boxes. Both come back without Calendar scopes, and in both cases the
 * right move is to leave whatever is stored alone. Overwriting would have been
 * a silent disconnect: the Calendar routes mint access tokens from the stored
 * refresh token, and one minted from an identity-only grant gets a 403 from the
 * Calendar API.
 *
 * A Calendar grant without a refresh token is kept out too: the stored refresh
 * token is the only thing the Calendar routes read, so there is nothing to gain
 * from storing the rest, and the connected flag would then be a lie.
 */
export function decideGoogleGrant(account: GoogleAccount | null | undefined): GrantDecision {
  if (!account || account.provider !== "google") return { action: "keep", reason: "not-google" };
  if (!hasCalendarScopes(account.scope)) return { action: "keep", reason: "no-calendar-scope" };
  if (!account.refresh_token) return { action: "keep", reason: "no-refresh-token" };
  return {
    action: "store",
    tokens: {
      refresh_token: account.refresh_token,
      access_token: account.access_token ?? null,
      expires_at: account.expires_at ?? null,
      scope: account.scope!,
    },
  };
}

/**
 * Settings sends people to Google with this in the return URL, so that coming
 * back it can tell "just tried to connect" from an ordinary visit. That is the
 * only way to notice a connect that came back without Calendar access: the
 * callback sees it as an ordinary login (see above).
 */
export const CALENDAR_CONNECT_RETURN_PARAM = "calendar";
export const CALENDAR_CONNECT_RETURN_VALUE = "connect";

/** The URL to come back to after connecting, from the path they started on. */
export function calendarConnectReturnTo(pathname: string): string {
  const url = new URL(pathname, "http://x");
  url.searchParams.set(CALENDAR_CONNECT_RETURN_PARAM, CALENDAR_CONNECT_RETURN_VALUE);
  return `${url.pathname}${url.search}`;
}

/**
 * On the way back: "declined" when they went to connect and the calendar is
 * still not connected (they unticked the Calendar boxes), "none" otherwise.
 * Someone already connected who re-consents with fewer boxes keeps their
 * previous grant, so there is nothing to tell them.
 */
export function calendarConnectOutcome(
  returnParam: string | null,
  connected: boolean,
): "declined" | "none" {
  return returnParam === CALENDAR_CONNECT_RETURN_VALUE && !connected ? "declined" : "none";
}
