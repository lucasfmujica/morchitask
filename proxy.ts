import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripEnglishPrefix, URL_LOCALE_HEADER } from "@/lib/seo";

// Paths that are reachable without a session. `/auth` covers the Spotify
// connect flow (/auth/spotify, /auth/spotify/callback) — kept public like the
// original app so a cookie hiccup during the cross-domain OAuth redirect back
// from Spotify can't bounce an already-signed-in user to /login mid-flow.
// `/api/webhooks` has no session by definition: the payment provider is not a
// browser. It is not unprotected — it verifies a signature instead — but a
// redirect to /login would turn every delivery into a 307 and lose the money.
//
// `/share` checks the session itself: the proxy's redirect would re-POST the
// share to /login, the route's own answers with a plain GET.
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/auth", "/api/webhooks", "/share"];

/** The marketing surface: the only pages a stranger is meant to read. Listed
 *  exactly rather than by prefix, so adding a route to `(marketing)` is a
 *  deliberate act and not an accidental hole in the app. */
const MARKETING_PATHS = ["/", "/pricing", "/privacy", "/terms"];

/** What crawlers fetch besides the pages. A login redirect on these would hand
 *  Google an HTML page where it expects a robots file, and it would then treat
 *  the whole site as crawlable-by-default with no sitemap. */
const CRAWLER_PATHS = ["/robots.txt", "/sitemap.xml"];

/** The marketing pages' share cards. Next serves them at a hashed path next to
 *  each page (`/pricing/opengraph-image-ab12cd`), so they are matched by shape
 *  rather than listed. */
const OG_IMAGE = /^(?:\/(?:pricing|privacy|terms))?\/opengraph-image(?:-[\w]+)?$/;

function isPublic(pathname: string) {
  if (MARKETING_PATHS.includes(pathname)) return true;
  if (CRAWLER_PATHS.includes(pathname) || OG_IMAGE.test(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Next 16 renamed the "middleware" convention to "proxy".
 * - no session + private route      -> redirect to /login
 * - session + /login or /           -> redirect to /today
 *
 * Signed-in people never see the marketing pages at `/`: they came to plan
 * their day, not to read a pitch they already accepted. The other marketing
 * routes stay reachable either way — someone with an account still has a
 * legitimate reason to read the terms or the price.
 *
 * English marketing URLs (`/en`, `/en/pricing`, ...) are not routes. They are
 * rewritten here to the same page with a header that tells `i18n/request.ts`
 * to render English, so the app's paths never move (see the note there about
 * the installed PWA). Every rule below judges the page the URL stands for, so
 * `/en` redirects a signed-in visitor exactly like `/` does.
 */
export const proxy = auth((req) => {
  const english = stripEnglishPrefix(req.nextUrl.pathname);
  const pathname = english ?? req.nextUrl.pathname;
  const isLoggedIn = !!req.auth;

  if (!isLoggedIn && !isPublic(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/today";
    return NextResponse.redirect(url);
  }

  // Trial over and nothing paid: everything funnels to /billing.
  //
  // `req.auth.access` is resolved in the session callback, so this costs no
  // query here — which matters, because this runs on every request. The
  // exceptions are the pages someone locked out still needs: the one where they
  // can pay, the one where they can leave with their data, and the legal pages
  // they are entitled to read.
  if (
    isLoggedIn &&
    req.auth?.access &&
    !req.auth.access.allowed &&
    !isReachableWhenLocked(pathname)
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/billing";
    return NextResponse.redirect(url);
  }

  // The header is only ever trusted because this is the one place that sets
  // it, so one arriving from outside is dropped. A spoofed one would only
  // change the language of the sender's own page, but it would also make that
  // page claim the wrong canonical URL, and there is no reason to allow it.
  const forwarded = new Headers(req.headers);
  forwarded.delete(URL_LOCALE_HEADER);

  if (english) {
    forwarded.set(URL_LOCALE_HEADER, "en");
    const url = req.nextUrl.clone();
    url.pathname = english;
    return NextResponse.rewrite(url, { request: { headers: forwarded } });
  }

  if (req.headers.has(URL_LOCALE_HEADER)) {
    return NextResponse.next({ request: { headers: forwarded } });
  }
});

/**
 * What is still reachable once the paywall closes.
 *
 * Settings stays open on purpose: it is where exporting your data and deleting
 * your account live, and holding those behind a payment would make "your data
 * is yours" untrue at the exact moment it matters most.
 */
const LOCKED_ALLOWED = ["/billing", "/settings", "/pricing", "/privacy", "/terms"];

function isReachableWhenLocked(pathname: string) {
  if (LOCKED_ALLOWED.includes(pathname)) return true;
  // The actions behind Settings, plus signing out.
  return pathname.startsWith("/api/auth") || pathname.startsWith("/api/webhooks");
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon.svg|icon-192.png|icon-512.png|apple-touch-icon.png|.*\\.(?:png|jpg|jpeg|svg|gif|webp)$).*)",
  ],
};
