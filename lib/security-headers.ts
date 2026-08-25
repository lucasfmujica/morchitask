/**
 * Response headers applied to every route (wired up in `next.config.ts`).
 *
 * Split deliberately into two groups: headers that cannot break a working page,
 * which are enforced, and a Content-Security-Policy, which very much can, and
 * so ships in Report-Only until its violations have been read.
 */

/** Where the app legitimately reaches outside itself. Derived by inventory, not
 *  guesswork — see the comment on each entry for what needs it. */
const SPOTIFY_SDK = "https://sdk.scdn.co"; // Web Playback SDK script + its iframe
const SPOTIFY_API = "https://api.spotify.com";
const SPOTIFY_CDN = "https://*.scdn.co"; // album art (i.scdn.co, mosaic.scdn.co, …)
const SPOTIFY_SOCKETS = "wss://*.spotify.com https://*.spotify.com"; // SDK player connection
const GOOGLE_AVATARS = "https://*.googleusercontent.com"; // profile pictures from sign-in
const VERCEL_BLOB = "https://*.blob.vercel-storage.com"; // avatars and task attachments

/**
 * The policy the app *should* be able to run under.
 *
 * `'unsafe-inline'` in script-src is not an oversight: `app/layout.tsx` inlines
 * the anti-flash theme script, and Next injects its own inline bootstrap.
 * Removing it means switching both to nonces, which needs the proxy to generate
 * one per request — worth doing, but not while the policy is unverified.
 */
const CSP = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' ${SPOTIFY_SDK}`,
  // Tailwind v4 and the inline `style` attributes across the UI need this.
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: ${GOOGLE_AVATARS} ${VERCEL_BLOB} ${SPOTIFY_CDN}`,
  `font-src 'self'`, // next/font self-hosts DM Sans at build time
  `connect-src 'self' ${SPOTIFY_API} ${SPOTIFY_SOCKETS} ${VERCEL_BLOB}`,
  `media-src 'self'`, // /sounds/*.mp3; the rest is WebAudio synthesis
  `frame-src ${SPOTIFY_SDK}`, // the SDK mounts a hidden player iframe
  `worker-src 'self'`, // Serwist service worker
  `manifest-src 'self'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
].join("; ");

export const securityHeaders = [
  // Six months, so a downgrade attack has nothing to work with. Browsers ignore
  // this over plain http, so localhost is unaffected.
  { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
  // Clickjacking. `frame-ancestors` above says the same thing to newer browsers.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops a .txt attachment from being sniffed into something executable —
  // attachments are user-supplied, so this one earns its place.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Task titles ride in URLs; don't hand full paths to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // None of these are used anywhere in the app (checked, not assumed).
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  /**
   * Report-Only on purpose. Enforcing an unverified CSP breaks the app for the
   * person using it every day, and a blocked script fails silently.
   *
   * To enforce: browse the app with devtools open — Day, Semana, Foco with
   * Spotify connected, an attachment preview, an avatar — fix whatever gets
   * reported, then rename this key to `Content-Security-Policy`.
   */
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];
