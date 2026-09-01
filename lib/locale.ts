/**
 * Which language the interface renders in.
 *
 * Spanish stays the default: it is what the app has always been, and what the
 * people already using it expect. Falling back to `es` on anything unexpected
 * is deliberate — a bad cookie should look like "nothing changed", not like a
 * different app.
 */
export const LOCALES = ["es", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";

/** Where the rendering locale is read from on every request. The database
 *  column is the source of truth; this is the copy that avoids a query. */
export const LOCALE_COOKIE = "morchitask-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Narrows anything — a cookie, a DB column, a URL param — to a usable locale. */
export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Picks a starting language for a brand-new account from its browser's
 * `Accept-Language`, e.g. `en-GB,en;q=0.9,es;q=0.8`.
 *
 * Only the language subtag matters here: `es-AR`, `es-ES` and `es` are all
 * Spanish as far as this app is concerned. Quality values are honoured in the
 * order the header lists them, which is how browsers already sort them; a
 * malformed header just yields the default.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const weight = q ? Number.parseFloat(q.split("=")[1]) : 1;
      return { language: tag.trim().toLowerCase().split("-")[0], weight };
    })
    .filter(
      (entry): entry is { language: Locale; weight: number } =>
        isLocale(entry.language) && Number.isFinite(entry.weight) && entry.weight > 0,
    )
    .sort((a, b) => b.weight - a.weight);

  return ranked[0]?.language ?? DEFAULT_LOCALE;
}
