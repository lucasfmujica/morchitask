import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, localeFromAcceptLanguage } from "@/lib/locale";

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
 * There is no locale in the URL. Paths are load-bearing here: the installed
 * PWA opens `start_url: "/today"`, the service worker navigates push
 * notifications to server-generated paths, and `proxy.ts` redirects to
 * `/login` and `/today`. Prefixing every route would break an app already
 * installed on someone's phone.
 *
 * KNOWN GAP, and it is a real one for the marketing pages: a crawler sends no
 * cookie, so Google only ever indexes the `Accept-Language` default. Proper
 * SEO for two languages needs `/en` and `/es` URLs with hreflang. That can be
 * added for the marketing routes alone, without touching the app's paths —
 * but it is not built, so do not expect the English landing to rank.
 */
export default getRequestConfig(async () => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(chosen)
    ? chosen
    : localeFromAcceptLanguage((await headers()).get("accept-language"));

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
