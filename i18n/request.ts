import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, toLocale } from "@/lib/locale";

/**
 * Resolves the language for one request.
 *
 * Reads a cookie rather than the session on purpose. This runs on every
 * rendered request, and `auth()` costs a database round trip — the cookie is
 * a copy of `profiles.locale`, written at sign-in and whenever the setting
 * changes, so the query happens once instead of continuously.
 *
 * There is no locale in the URL. Paths are load-bearing here: the installed
 * PWA opens `start_url: "/today"`, the service worker navigates push
 * notifications to server-generated paths, and `proxy.ts` redirects to
 * `/login` and `/today`. Prefixing every route would break an app already
 * installed on someone's phone. Marketing pages, when they exist, can carry
 * their own prefixes for hreflang without touching any of this.
 */
export default getRequestConfig(async () => {
  const locale = toLocale((await cookies()).get(LOCALE_COOKIE)?.value);

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
