import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Paths that are reachable without a session. `/auth` covers the Spotify
// connect flow (/auth/spotify, /auth/spotify/callback) — kept public like the
// original app so a cookie hiccup during the cross-domain OAuth redirect back
// from Spotify can't bounce an already-signed-in user to /login mid-flow.
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/auth"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Next 16 renamed the "middleware" convention to "proxy".
 * - no session + private route  -> redirect to /login
 * - session + /login            -> redirect to /today
 */
export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  if (!isLoggedIn && !isPublic(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/today";
    return NextResponse.redirect(url);
  }
});

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon.svg|icon-192.png|icon-512.png|apple-touch-icon.png|.*\\.(?:png|jpg|jpeg|svg|gif|webp)$).*)",
  ],
};
