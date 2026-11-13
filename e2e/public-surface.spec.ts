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
const PRIVATE_ROUTES = [
  "/today",
  "/backlog",
  "/settings",
  "/metas",
  "/focus",
  "/routines",
  "/billing",
  // Admin-only, and still an app route first: logged out is a login redirect,
  // and only after sign-in does the allowlist get to answer 404.
  "/admin/metrics",
  // Onboarding lives in a route group of its own, outside the app shell, so it
  // is the one private page whose protection doesn't come along with (app).
  // Step 3 is also where Google returns to after connecting the calendar.
  "/onboarding",
  "/onboarding/1",
  "/onboarding/3",
];

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

test.describe("Vercel Web Analytics", () => {
  test("its endpoints are not behind the login redirect", async ({ request }) => {
    // Locally nothing serves /_vercel, so this answers 404. Through the proxy
    // it would be a 307 to /login, which on Vercel means every logged-out page
    // view (the whole top of the funnel) silently fails to record.
    const response = await request.get("/_vercel/insights/script.js", {
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    expect(response.status()).not.toBe(307);
  });
});

test.describe("the payment webhook", () => {
  /**
   * The one unauthenticated endpoint that writes.
   *
   * It must not be behind the login redirect — the payment provider is not a
   * browser, and a 307 to /login would be recorded as a successful delivery
   * while the subscription never lands. It also must not accept anything: with
   * no secret configured it refuses outright, the same fail-closed rule the
   * cron routes have.
   */
  test("is reachable without a session, and still refuses the request", async ({ request }) => {
    const response = await request.post("/api/webhooks/polar", {
      data: { type: "subscription.active" },
      failOnStatusCode: false,
      maxRedirects: 0,
    });

    expect(response.status(), "a redirect here would silently lose payments").not.toBe(307);
    // 503 without a secret, 403 with one and a bad signature. Never 2xx, and
    // never a redirect.
    expect([403, 503]).toContain(response.status());
  });

  test("never accepts an unsigned payload", async ({ request }) => {
    const response = await request.post("/api/webhooks/polar", {
      data: {
        type: "subscription.active",
        data: { id: "sub_forged", status: "active", customerId: "cus_forged" },
      },
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    expect(response.ok()).toBe(false);
  });
});

test.describe("the inbound email webhook", () => {
  /**
   * Writes tasks into someone's backlog from outside, so it gets the payment
   * webhook's treatment: reachable without a session (a mail relay is not a
   * browser) and refusing anything without the shared secret.
   */
  test("is reachable without a session, and refuses an unauthenticated delivery", async ({
    request,
  }) => {
    const response = await request.post("/api/webhooks/inbound-email", {
      data: { to: "backlog+00000000000000000000000000000000.000000000000@x.test", text: "hola" },
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    expect(response.status()).not.toBe(307);
    // 503 without configuration, 403 with it and no secret. Never 2xx.
    expect([403, 503]).toContain(response.status());
  });
});

test.describe("English marketing URLs", () => {
  /**
   * `/en/...` is not a route: `proxy.ts` rewrites it to the unprefixed page with
   * a header `i18n/request.ts` reads first. These pin both halves, and that the
   * unprefixed URL is still the Spanish one for a client that asks for nothing.
   */
  test("/en serves English, even to a Spanish browser with a Spanish cookie", async ({
    browser,
  }) => {
    // The URL beats every other signal: hreflang promises English there.
    const context = await browser.newContext({ locale: "es-AR" });
    await context.addCookies([
      { name: "morchitask-locale", value: "es", url: "http://localhost:3100" },
    ]);
    const page = await context.newPage();
    const response = await page.goto("/en");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await context.close();
  });

  test("/en/pricing serves the English pricing page", async ({ page }) => {
    const response = await page.goto("/en/pricing");
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "One plan." })).toBeVisible();
  });

  test("/en/privacy and /en/terms render in English", async ({ request }) => {
    for (const path of ["/en/privacy", "/en/terms"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
      expect(await response.text(), path).toContain('<html lang="en"');
    }
  });

  test("an /en prefix never reaches the app", async ({ request }) => {
    // Only marketing pages are rewritten; /en/today must not become /today.
    const response = await request.get("/en/today", { maxRedirects: 0 });
    expect(response.status()).not.toBe(200);
  });

  test("/ is Spanish for a client that sends no language at all", async ({ request }) => {
    // What a crawler looks like: no cookie, no Accept-Language. Deterministic,
    // unlike a browser context, which always sends its locale.
    const html = await (await request.get("/", { headers: { "accept-language": "" } })).text();
    expect(html).toContain('<html lang="es"');
  });

  test("a spoofed locale header from outside is ignored", async ({ request }) => {
    const html = await (
      await request.get("/pricing", { headers: { "x-mt-locale": "en", "accept-language": "es" } })
    ).text();
    expect(html).toContain('<html lang="es"');
  });
});

test.describe("SEO", () => {
  const hreflangs = async (request: import("@playwright/test").APIRequestContext, path: string) => {
    const html = await (await request.get(path)).text();
    return {
      html,
      langs: [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)].map(
        (m) => [m[1], new URL(m[2]).pathname],
      ),
      canonical: html.match(/<link rel="canonical" href="([^"]+)"/)?.[1],
    };
  };

  for (const [path, canonical] of [
    ["/", "/"],
    ["/en", "/en"],
    ["/pricing", "/pricing"],
    ["/en/pricing", "/en/pricing"],
  ] as const) {
    test(`${path} declares its canonical and the hreflang pair`, async ({ request }) => {
      const { langs, canonical: c } = await hreflangs(request, path);
      expect(c && new URL(c).pathname).toBe(canonical);
      const page = canonical.replace(/^\/en/, "") || "/";
      expect(langs).toEqual(
        expect.arrayContaining([
          ["es", page],
          ["en", page === "/" ? "/en" : `/en${page}`],
          ["x-default", page],
        ]),
      );
    });
  }

  test("robots.txt allows the site, keeps crawlers out of the app, names the sitemap", async ({
    request,
  }) => {
    const response = await request.get("/robots.txt", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /api/");
    expect(body).toContain("Disallow: /today");
    expect(body).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });

  test("sitemap.xml lists both languages of the marketing pages", async ({ request }) => {
    const response = await request.get("/sitemap.xml", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const body = await response.text();
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    for (const path of ["/", "/pricing", "/privacy", "/terms", "/en", "/en/pricing"]) {
      expect(locs).toContain(path);
    }
    expect(body).toContain('hreflang="en"');
  });

  test("the share image is public", async ({ request }) => {
    const html = await (await request.get("/pricing")).text();
    const src = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    expect(src).toBeTruthy();
    const image = await request.get(new URL(src!).pathname + new URL(src!).search, {
      maxRedirects: 0,
    });
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/png");
  });

  const jsonLd = (html: string) =>
    [...html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)].flatMap((m) => {
      const data = JSON.parse(m[1]);
      return Array.isArray(data) ? data : [data];
    });

  test("/ describes the product with its real price and no rating", async ({ request }) => {
    const items = jsonLd(await (await request.get("/")).text());
    const app = items.find((d) => d["@type"] === "SoftwareApplication");
    expect(app, "SoftwareApplication JSON-LD on /").toBeTruthy();
    expect(app.offers.map((o: { price: string }) => Number(o.price))).toContain(10);
    expect(JSON.stringify(app)).not.toContain("aggregateRating");
    expect(items.some((d) => d["@type"] === "Organization")).toBe(true);
  });

  test("/pricing carries a FAQPage built from the visible questions", async ({ page }) => {
    await page.goto("/pricing");
    const items = jsonLd(await page.content());
    const faq = items.find((d) => d["@type"] === "FAQPage");
    expect(faq.mainEntity.length).toBe(await page.locator("details").count());
    const first = faq.mainEntity[0].name;
    await expect(page.locator("summary", { hasText: first })).toBeVisible();
    // The price on the page and in the card agree, both from lib/pricing.
    await expect(page.getByText("US$80").first()).toBeVisible();
  });
});

test.describe("pricing period toggle", () => {
  test("defaults to yearly with the saving, and switches to monthly", async ({ browser }) => {
    const context = await browser.newContext({ locale: "es-AR" });
    const page = await context.newPage();
    await page.goto("/pricing");
    const yearly = page.getByRole("button", { name: "Anual" });
    await expect(yearly).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Ahorrás 33%")).toBeVisible();

    await page.getByRole("button", { name: "Mensual" }).click();
    await expect(yearly).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Ahorrás 33%")).toHaveCount(0);
    await expect(page.getByText("por mes", { exact: true })).toBeVisible();
    await context.close();
  });
});
