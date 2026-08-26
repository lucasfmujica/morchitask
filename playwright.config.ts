import { defineConfig, devices } from "@playwright/test";

/**
 * E2E specs live in /e2e and run against a real production build.
 *
 * `next dev` and `next start` are NOT interchangeable here: the proxy bundle
 * inlines its env at build time, so a config value like AUTH_TRUST_HOST that is
 * only exported at runtime has no effect on a build made without it. Testing
 * the production build is also the point — that's what ships.
 *
 * The database URL below is deliberately unreachable. Everything these specs
 * cover (route protection, the 401s, language, headers, the manifest) resolves
 * before any query runs, and a fake URL keeps the suite from needing infra.
 * A spec that needs a session will need a real Postgres *and* Neon's HTTP proxy
 * in front of it, since `lib/db/client.ts` speaks Neon's wire protocol.
 */
const PORT = 3100;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Use a Chromium that's already on the machine, when there is one.
 *
 * Some sandboxes ship a browser build that doesn't match what this version of
 * @playwright/test would download, and downloading is either blocked or a waste
 * of a few hundred MB. Set PLAYWRIGHT_CHROMIUM_PATH to that binary and the
 * suite uses it; leave it unset (CI, a normal laptop) and Playwright picks its
 * own, which is the behaviour you want everywhere else.
 *
 * `mobile-safari` really is WebKit: `devices["iPhone 14"]` sets
 * defaultBrowserType to webkit, which matters because iOS Safari is where this
 * PWA actually gets installed. When the Chromium override above is in play
 * there is no WebKit to run, so that project degrades to a Chromium engine at
 * an iPhone viewport — still useful for layout and touch targets, but it stops
 * being a Safari test. Better to say so than to quietly call it one.
 */
const launchOptions = {
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
  // Chromium refuses to start as root without this, which is the normal state
  // inside a container. Off by default on purpose: it drops the browser's own
  // sandbox, and that should be an explicit choice made by whoever knows they
  // are already inside one.
  ...(process.env.PLAYWRIGHT_NO_SANDBOX ? { args: ["--no-sandbox"] } : {}),
};
const chromium = Object.keys(launchOptions).length ? { launchOptions } : {};
/** Only when a Chromium binary was forced: WebKit can't run from it. */
const forceChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? ({ browserName: "chromium" } as const)
  : {};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"], ...forceChromium, ...chromium },
    },
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], ...chromium },
    },
  ],
  // Skipped when E2E_BASE_URL points somewhere already running.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npx next start -p " + PORT,
        url: BASE_URL + "/login",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          DATABASE_URL: "postgresql://e2e:e2e@127.0.0.1:1/unreachable",
          AUTH_SECRET: "e2e-only-not-a-real-secret",
          // Auth.js refuses to resolve a session on an untrusted host, and that
          // failure is silent in the proxy — every route would look public.
          AUTH_TRUST_HOST: "true",
          NEXT_PUBLIC_APP_URL: BASE_URL,
        },
      },
});
