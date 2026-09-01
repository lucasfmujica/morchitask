import { expect, test } from "@playwright/test";

/**
 * The marketing surface — the only pages a stranger is meant to reach.
 *
 * Two things here are easy to break without noticing. One is `proxy.ts`: these
 * routes are public by an explicit allowlist, and a typo there turns the
 * landing into a redirect to /login, which is invisible to anyone already
 * signed in. The other is the language, which for a first-time visitor comes
 * from `Accept-Language` rather than a cookie — that is the path a Product Hunt
 * visitor takes, and nobody signed in ever exercises it.
 */

const PUBLIC_PAGES = ["/", "/pricing", "/privacy", "/terms"];

test.describe("reachable without an account", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} renders for a logged-out visitor`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      // Not bounced into the app's login redirect.
      await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : path}`));
    });
  }

  test("the landing links to the legal pages Google will look for", async ({ page }) => {
    // Google's OAuth verification requires a privacy policy and terms linked
    // from the app's home page; a broken link here fails the review.
    await page.goto("/");
    await expect(page.getByRole("link", { name: /privacidad|privacy/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /términos|terms/i })).toBeVisible();
  });
});

test.describe("first-time language", () => {
  test("an English browser gets the English landing, with no cookie", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await context.close();
  });

  test("a Spanish browser gets the Spanish landing", async ({ browser }) => {
    const context = await browser.newContext({ locale: "es-AR" });
    const page = await context.newPage();
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
    await context.close();
  });
});

test.describe("price", () => {
  test("the landing and /pricing quote the same number", async ({ page }) => {
    // Both read `lib/pricing.ts`. This catches the day someone hardcodes one.
    await page.goto("/");
    const landing = await page.getByText(/\$10/).first().textContent();
    expect(landing).toContain("10");

    await page.goto("/pricing");
    await expect(page.getByText("$10").first()).toBeVisible();
    await expect(page.getByText("$80").first()).toBeVisible();
  });
});

test.describe("what the public pages ship", () => {
  /**
   * The landing used to serialize the whole 29 KB catalog into its HTML — the
   * wording of the shutdown ritual, the Pomodoro timer and the settings screen,
   * sent to someone who had not signed up and could not reach any of them.
   *
   * This asserts the trimming rather than the byte count: a size threshold would
   * drift with every copy change, while a namespace that has no business on a
   * public page either is there or is not.
   */
  // Taken verbatim from messages/es.json so the assertion cannot pass by
  // looking for a string that was never there in the first place.
  const PRIVATE_STRINGS = [
    "Guardar y ver mañana", // shutdown
    "¡Bloque de foco completado!", // focus
    "Elegí un archivo de imagen", // settings
    "Ajustar la capacidad de hoy", // day
  ];

  for (const path of ["/", "/pricing", "/privacy", "/terms", "/login"]) {
    test(`${path} does not carry the app's private namespaces`, async ({ request }) => {
      const html = await (await request.get(path)).text();
      for (const s of PRIVATE_STRINGS) {
        expect(html, `${path} should not ship "${s}"`).not.toContain(s);
      }
    });
  }

  test("the landing still has the words it is supposed to have", async ({ request }) => {
    // The other half of the assertion above: trimming to nothing would pass it.
    const html = await (await request.get("/")).text();
    expect(html).toContain("Tres momentos");
  });
});
