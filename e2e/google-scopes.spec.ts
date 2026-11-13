import { expect, test } from "@playwright/test";
import { CALENDAR_AUTHORIZATION_PARAMS } from "../lib/google-grant";

/**
 * What the app asks Google for.
 *
 * Asking for Calendar at sign-in put every new account behind Google's
 * unverified-app block ("Error 403: access_denied"), before it could log in at
 * all. Nothing in the app looks wrong when that happens, and neither does a
 * unit test of a constant if something between the constant and Google's URL
 * adds the scopes back. So this reads the URL the browser is actually sent to.
 *
 * Needs no database: building the authorization URL is all Auth.js does before
 * the browser leaves. It does need the server to reach accounts.google.com,
 * since the Google provider discovers its endpoints there.
 */

const GOOGLE_AUTHORIZE = /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/;

test.describe("Google authorization", () => {
  test("the login button asks for identity only", async ({ page }) => {
    let authorizeUrl: URL | null = null;
    // Stop at Google's door: record where the browser was sent, go no further.
    await page.route(GOOGLE_AUTHORIZE, (route) => {
      authorizeUrl = new URL(route.request().url());
      return route.abort();
    });

    await page.goto("/login");
    await page.getByRole("button", { name: /Google/ }).click();
    await expect.poll(() => authorizeUrl, { timeout: 15_000 }).not.toBeNull();

    const params = authorizeUrl!.searchParams;
    expect(params.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
    expect(params.has("access_type")).toBe(false);
    expect(params.has("prompt")).toBe(false);
    expect(params.has("include_granted_scopes")).toBe(false);
  });

  test("the connect params reach Google as an incremental Calendar grant", async ({ request }) => {
    // The Settings button needs a session, which this suite cannot have. What
    // it adds on top of the login is the third argument to `signIn`, which the
    // client sends as the query string of this same POST; this checks that the
    // installed Auth.js lets those override the provider's defaults.
    const { csrfToken } = await (await request.get("/api/auth/csrf")).json();
    const res = await request.post(
      `/api/auth/signin/google?${new URLSearchParams(CALENDAR_AUTHORIZATION_PARAMS)}`,
      {
        headers: { "X-Auth-Return-Redirect": "1" },
        form: { csrfToken, callbackUrl: "/settings?calendar=connect" },
      },
    );
    const { url } = await res.json();
    expect(url).toMatch(GOOGLE_AUTHORIZE);

    const params = new URL(url).searchParams;
    expect(params.get("scope")).toBe(CALENDAR_AUTHORIZATION_PARAMS.scope);
    expect(params.get("scope")).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("prompt")).toBe("consent");
    expect(params.get("include_granted_scopes")).toBe("true");
  });
});
