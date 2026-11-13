import { describe, expect, it } from "vitest";
import {
  BASIC_SCOPES,
  CALENDAR_AUTHORIZATION_PARAMS,
  CALENDAR_SCOPES,
  SIGN_IN_AUTHORIZATION_PARAMS,
  calendarConnectOutcome,
  calendarConnectReturnTo,
  decideGoogleGrant,
  grantedScopes,
  hasCalendarScopes,
} from "./google-grant";

const [READONLY, EVENTS] = CALENDAR_SCOPES;
// What Google actually sends back: full userinfo URLs, not the short aliases,
// in its own order.
const BASIC_GRANTED =
  "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";
const CALENDAR_GRANTED = `${BASIC_GRANTED} ${EVENTS} ${READONLY}`;

describe("authorization params", () => {
  it("sign-in asks for identity only, with no offline token and no forced consent", () => {
    expect(SIGN_IN_AUTHORIZATION_PARAMS).toEqual({ scope: "openid email profile" });
    expect(SIGN_IN_AUTHORIZATION_PARAMS.scope).not.toMatch(/calendar/);
    expect(SIGN_IN_AUTHORIZATION_PARAMS).not.toHaveProperty("access_type");
    expect(SIGN_IN_AUTHORIZATION_PARAMS).not.toHaveProperty("prompt");
  });

  it("connecting asks for both Calendar scopes incrementally, with a refresh token", () => {
    const scopes = grantedScopes(CALENDAR_AUTHORIZATION_PARAMS.scope);
    for (const s of [...BASIC_SCOPES, ...CALENDAR_SCOPES]) expect(scopes.has(s)).toBe(true);
    expect(CALENDAR_AUTHORIZATION_PARAMS).toMatchObject({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });
  });
});

describe("hasCalendarScopes", () => {
  it("needs both scopes, in any order and spacing", () => {
    expect(hasCalendarScopes(CALENDAR_GRANTED)).toBe(true);
    expect(hasCalendarScopes(`  ${READONLY}\n${EVENTS} `)).toBe(true);
  });

  it("rejects identity-only, partial, empty and missing scopes", () => {
    expect(hasCalendarScopes(BASIC_GRANTED)).toBe(false);
    expect(hasCalendarScopes(`${BASIC_GRANTED} ${READONLY}`)).toBe(false);
    expect(hasCalendarScopes(`${BASIC_GRANTED} ${EVENTS}`)).toBe(false);
    expect(hasCalendarScopes("")).toBe(false);
    expect(hasCalendarScopes(null)).toBe(false);
    expect(hasCalendarScopes(undefined)).toBe(false);
  });

  it("does not match on a prefix", () => {
    expect(hasCalendarScopes(`${READONLY}x ${EVENTS}`)).toBe(false);
  });
});

describe("decideGoogleGrant", () => {
  const google = { provider: "google", access_token: "at", expires_at: 1_800_000_000 };

  it("new user, plain sign-in: keeps (nothing Calendar to store)", () => {
    expect(decideGoogleGrant({ ...google, scope: BASIC_GRANTED })).toEqual({
      action: "keep",
      reason: "no-calendar-scope",
    });
  });

  it("connected user signs in again: keeps their stored grant even if a refresh token comes back", () => {
    // The old callback stored any refresh token it saw. An identity-only one
    // replacing the Calendar one is a silent disconnect.
    expect(
      decideGoogleGrant({ ...google, refresh_token: "identity-only", scope: BASIC_GRANTED }),
    ).toEqual({ action: "keep", reason: "no-calendar-scope" });
  });

  it("connect with both Calendar boxes ticked: stores the tokens", () => {
    expect(decideGoogleGrant({ ...google, refresh_token: "rt", scope: CALENDAR_GRANTED })).toEqual({
      action: "store",
      tokens: {
        refresh_token: "rt",
        access_token: "at",
        expires_at: 1_800_000_000,
        scope: CALENDAR_GRANTED,
      },
    });
  });

  it("connect with the Calendar boxes unticked: keeps", () => {
    expect(decideGoogleGrant({ ...google, refresh_token: "rt", scope: BASIC_GRANTED })).toEqual({
      action: "keep",
      reason: "no-calendar-scope",
    });
  });

  it("connect with only one Calendar box ticked: keeps", () => {
    expect(
      decideGoogleGrant({ ...google, refresh_token: "rt", scope: `${BASIC_GRANTED} ${READONLY}` }),
    ).toEqual({ action: "keep", reason: "no-calendar-scope" });
  });

  it("Calendar scopes but no refresh token: keeps (the Calendar routes need one)", () => {
    expect(decideGoogleGrant({ ...google, scope: CALENDAR_GRANTED })).toEqual({
      action: "keep",
      reason: "no-refresh-token",
    });
  });

  it("missing optional fields come through as null", () => {
    const d = decideGoogleGrant({
      provider: "google",
      refresh_token: "rt",
      scope: CALENDAR_GRANTED,
    });
    expect(d).toMatchObject({ action: "store", tokens: { access_token: null, expires_at: null } });
  });

  it("other providers and no account: keeps", () => {
    expect(
      decideGoogleGrant({ provider: "spotify", refresh_token: "rt", scope: CALENDAR_GRANTED }),
    ).toEqual({ action: "keep", reason: "not-google" });
    expect(decideGoogleGrant(null)).toEqual({ action: "keep", reason: "not-google" });
  });
});

describe("the return trip from a connect", () => {
  it("marks the return URL", () => {
    expect(calendarConnectReturnTo("/settings")).toBe("/settings?calendar=connect");
  });

  it("is declined only when they went to connect and are still not connected", () => {
    expect(calendarConnectOutcome("connect", false)).toBe("declined");
    expect(calendarConnectOutcome("connect", true)).toBe("none");
    expect(calendarConnectOutcome(null, false)).toBe("none");
    expect(calendarConnectOutcome("something-else", false)).toBe("none");
  });
});
