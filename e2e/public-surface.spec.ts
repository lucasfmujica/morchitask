import { expect, test } from "@playwright/test";

/**
 * What a logged-out visitor gets.
 *
 * These are the only end-to-end checks that can run without a database: the
 * moment a spec needs a session it needs a real Postgres AND the Neon HTTP
 * proxy in front of it, because `lib/db/client.ts` speaks Neon's wire protocol
 * rather than plain pg. That is worth building, but it is its own piece of
 * infrastructure — so this file deliberately covers the surface that doesn't
 * need it, and covers it properly.
 *
 * The gap it closes: everything below was previously verified by reading the
 * code, not by asking a browser.
 */

/** Every authenticated route, sampled across the route groups. */
const PRIVATE_ROUTES = ["/today", "/backlog", "/settings", "/metas", "/focus", "/routines"];

test.describe("route protection", () => {
  for (const route of PRIVATE_ROUTES) {
    test(`${route} sends a logged-out visitor to /login`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status(), `${route} should have rendered something`).toBe(200);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("/login is reachable when logged out", async ({ page }) => {
    // The inverse of the rule above, and the one that actually breaks sign-up
    // if `proxy.ts` ever decides an anonymous visitor is logged in: they would
    // be bounced from /login to /today and could never get in at all.
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });
});

test.describe("data endpoints serve nothing to anonymous callers", () => {
  /**
   * Worth knowing what actually happens here, because it surprised me: these
   * do NOT answer 401. `proxy.ts` only exempts /login, /api/auth and /auth, so
   * an anonymous call to a data route is redirected to /login before the route
   * handler ever runs. The handler's own 401 (`requireSession()`) is the second
   * line, reached only once the proxy has let you past.
   *
   * That means a JSON client gets an HTML login page rather than a 401, which
   * is a wart — but it is the current contract, and the security outcome is the
   * same: no data. Asserting the redirect is what pins the behaviour; asserting
   * 401 would quietly pass against a proxy that had stopped protecting
   * anything, which is precisely the bug worth catching.
   */
  const ENDPOINTS = [
    "/api/tasks?date=2026-08-26",
    "/api/tasks/counts?start=2026-08-01&end=2026-08-31",
    "/api/tasks/search?q=a",
  ];

  for (const endpoint of ENDPOINTS) {
    test(`${endpoint.split("?")[0]} is intercepted before it runs`, async ({ request }) => {
      const response = await request.get(endpoint, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers()["location"]).toContain("/login");
    });

    test(`${endpoint.split("?")[0]} never returns task data`, async ({ request }) => {
      // Following the redirect the way a fetch() would: whatever comes back,
      // it must not be the payload.
      const response = await request.get(endpoint);
      const body = await response.text();
      expect(body).not.toContain('"tasks"');
      expect(body).not.toContain('"household_id"');
    });
  }
});

test.describe("language", () => {
  // The check I could not make from a unit test: that the catalogs actually
  // reach the rendered page, and that the cookie is what picks between them.
  // `/login` is fully translated and needs no session, so it is the one page
  // where this can be proven end to end.

  test("a Spanish browser with no cookie gets Spanish", async ({ browser }) => {
    // The locale is explicit because the rule depends on it: with no cookie the
    // language comes from Accept-Language, so a test that relied on the
    // runner's default browser locale would be asserting an accident.
    const context = await browser.newContext({ locale: "es-AR" });
    const page = await context.newPage();
    await page.goto("/login");

    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByText("Planificá tu día y tu semana")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
    await context.close();
  });

  test("renders English when the locale cookie says so", async ({ page, context }) => {
    await context.addCookies([
      { name: "morchitask-locale", value: "en", url: "http://localhost:3100" },
    ]);
    await page.goto("/login");
    // `lang` drives screen-reader pronunciation, so it has to follow too.
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Plan your day and your week")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByText("Planificá tu día y tu semana")).toHaveCount(0);
  });

  test("a nonsense cookie is ignored, not obeyed", async ({ browser }) => {
    // An unusable cookie means "no stated preference", so the browser decides —
    // the same path a first-time visitor takes. It must not render the literal
    // "zzz" locale, and it must not throw.
    const context = await browser.newContext({ locale: "es-AR" });
    await context.addCookies([
      { name: "morchitask-locale", value: "zzz", url: "http://localhost:3100" },
    ]);
    const page = await context.newPage();
    await page.goto("/login");

    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await context.close();
  });
});

test.describe("security headers", () => {
  test("are present on a page response", async ({ request }) => {
    const response = await request.get("/login");
    const headers = response.headers();

    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });

  test("CSP stays report-only", async ({ request }) => {
    // Deliberate, and easy to "fix" by accident: the policy still allows
    // 'unsafe-inline' for scripts (Next's inlined bootstrap needs it), so
    // enforcing it today would break the app rather than protect it. There is
    // a unit test asserting the same thing; this one proves it survives a real
    // response, headers middleware and all.
    const response = await request.get("/login");
    const headers = response.headers();
    expect(headers["content-security-policy-report-only"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toBeUndefined();
  });
});

test.describe("PWA", () => {
  test("serves a manifest whose start_url matches the app's real route", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);

    const manifest = await response.json();
    // Not cosmetic: this is why the app has no locale prefixes in its URLs. An
    // installed PWA opens start_url, so changing it strands every phone that
    // already added the app to its home screen.
    expect(manifest.start_url).toBe("/today");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test("the manifest is reachable without a session", async ({ request }) => {
    // It is excluded from the proxy matcher on purpose — a redirect here means
    // the install prompt gets HTML instead of JSON and silently stops working.
    const response = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
  });
});
