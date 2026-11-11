import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, localeFromAcceptLanguage } from "@/lib/locale";
import { URL_LOCALE_HEADER } from "@/lib/seo";

/**
 * Resolves the language for one request.
 *
 * Reads a cookie rather than the session on purpose. This runs on every
 * rendered request, and `auth()` costs a database round trip — the cookie is
 * a copy of `profiles.locale`, written at sign-in and whenever the setting
 * changes, so the query happens once instead of continuously.
 *
 * With no cookie — a first-time visitor, which now includes anyone landing on
 * the marketing pages — the browser's `Accept-Language` decides. This is the
 * same rule sign-up already applied when seeding `profiles.locale`, so the
 * language someone sees before they have an account matches the one their
 * account is created with. It changes nothing for people already signed in:
 * they have the cookie, written at sign-in and on every change.
 *
 * App paths carry no locale. Paths are load-bearing there: the installed PWA
 * opens `start_url: "/today"`, the service worker navigates push notifications
 * to server-generated paths, and `proxy.ts` redirects to `/login` and
 * `/today`. Prefixing every route would break an app already installed on
 * someone's phone.
 *
 * The marketing pages are the exception, because a crawler sends no cookie
 * and usually no `Accept-Language`, so it could only ever index one language.
 * `/en`, `/en/pricing`, `/en/privacy` and `/en/terms` are English URLs: the
 * proxy rewrites them to the unprefixed page and sets `x-mt-locale: en`, which
 * is read FIRST here and beats even the cookie (a URL that says English has to
 * render English, or the hreflang pointing at it would be a lie).
 *
 * The unprefixed marketing URLs are the Spanish ones, but rendering there still
 * follows cookie, then `Accept-Language`, as before. Forcing Spanish on them
 * would greet every English-speaking first visitor in Spanish, and the
 * sign-up locale rule above relies on this path. What makes crawlers index
 * them as Spanish is not the rendered text but the page's own declarations:
 * `canonical` points at itself, hreflang maps `es` and `x-default` to the
 * unprefixed URL and `en` to `/en/...` (see `marketingMetadata` in
 * `lib/seo.ts`), and a crawler with no language headers renders the Spanish
 * default anyway. The sitemap lists both versions.
 */
export default getRequestConfig(async () => {
  const requestHeaders = await headers();
  // Only `proxy.ts` can set this: it strips any copy arriving from outside.
  const fromUrl = requestHeaders.get(URL_LOCALE_HEADER);
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromUrl)
    ? fromUrl
    : isLocale(chosen)
      ? chosen
      : localeFromAcceptLanguage(requestHeaders.get("accept-language"));

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // The app is Argentine in origin and its users are there; day boundaries
    // and durations must not drift with the browser's guess.
    timeZone: "America/Argentina/Buenos_Aires",
    onError(error) {
      // A missing message should be loud in development and survivable in
      // production — next-intl renders the key itself, which is ugly but not
      // a blank screen.
      if (process.env.NODE_ENV === "development") console.error(error);
    },
    getMessageFallback({ key, namespace }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});

export { DEFAULT_LOCALE };
