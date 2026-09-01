import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Paths that are reachable without a session. `/auth` covers the Spotify
// connect flow (/auth/spotify, /auth/spotify/callback) — kept public like the
// original app so a cookie hiccup during the cross-domain OAuth redirect back
// from Spotify can't bounce an already-signed-in user to /login mid-flow.
// `/api/webhooks` has no session by definition: the payment provider is not a
// browser. It is not unprotected — it verifies a signature instead — but a
// redirect to /login would turn every delivery into a 307 and lose the money.
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/auth", "/api/webhooks"];

/** The marketing surface: the only pages a stranger is meant to read. Listed
 *  exactly rather than by prefix, so adding a route to `(marketing)` is a
 *  deliberate act and not an accidental hole in the app. */
const MARKETING_PATHS = ["/", "/pricing", "/privacy", "/terms"];

function isPublic(pathname: string) {
  if (MARKETING_PATHS.includes(pathname)) return true;
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
 */
export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
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
