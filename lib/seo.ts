import type { Metadata } from "next";
import type { Locale } from "@/lib/locale";
import { PRICE_MONTHLY_USD, PRICE_YEARLY_USD } from "@/lib/pricing";

/**
 * Search-engine plumbing for the marketing pages: URLs, hreflang, JSON-LD.
 *
 * Pure on purpose (no `headers()`, no translations) so the parts that would be
 * embarrassing to get wrong, a price that disagrees with the checkout or a star
 * rating nobody gave us, are pinned by unit tests rather than by reading HTML.
 * The request-bound half lives in `lib/seo-server.ts`.
 */

/**
 * The public origin, for canonical URLs, the sitemap and `metadataBase`.
 *
 * `NEXT_PUBLIC_SITE_URL` is the one meant for this. It falls back to
 * `NEXT_PUBLIC_APP_URL`, which production already sets for the calendar
 * back-link, so a deploy that never heard of the new variable still emits its
 * own host instead of someone else's. The last fallback is the deployment that
 * exists today; a canonical pointing at a domain we do not serve yet would tell
 * Google to index nothing.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://productivity-app-three-pink.vercel.app"
).replace(/\/+$/, "");

/** Request header `proxy.ts` sets when it rewrites `/en/...` to the real
 *  route. The only way a page learns which URL it was reached through, since
 *  the rewrite hides the prefix from the router. */
export const URL_LOCALE_HEADER = "x-mt-locale";

/**
 * Marketing routes that exist in both languages. Spanish is unprefixed (it is
 * what `/` has always been, and changing that would move every inbound link);
 * English lives under `/en`. App routes never get a prefix: see the comment in
 * `i18n/request.ts` about the installed PWA.
 */
export const MARKETING_PAGES = ["/", "/pricing", "/privacy", "/terms"] as const;
export type MarketingPage = (typeof MARKETING_PAGES)[number];

export function isMarketingPage(path: string): path is MarketingPage {
  return (MARKETING_PAGES as readonly string[]).includes(path);
}

/** `/pricing` + en -> `/en/pricing`; `/` + en -> `/en`; Spanish unchanged. */
export function localizedPath(page: MarketingPage, locale: Locale): string {
  if (locale === "es") return page;
  return page === "/" ? "/en" : `/en${page}`;
}

/**
 * The inverse, for the proxy: `/en/pricing` -> `/pricing`. Returns null for
 * anything that is not an English marketing URL, so `/en/today` stays a 404
 * instead of quietly becoming the app.
 */
export function stripEnglishPrefix(pathname: string): MarketingPage | null {
  if (pathname === "/en" || pathname === "/en/") return "/";
  if (!pathname.startsWith("/en/")) return null;
  const rest = pathname.slice(3).replace(/\/+$/, "");
  return isMarketingPage(rest) ? rest : null;
}

/** hreflang map for one page. `x-default` is Spanish: it is what `/` serves to
 *  a crawler that sends no language, so saying anything else would be false. */
export function languageAlternates(page: MarketingPage) {
  return {
    es: localizedPath(page, "es"),
    en: localizedPath(page, "en"),
    "x-default": localizedPath(page, "es"),
  } as const;
}

/**
 * The metadata every marketing page shares, given its own title/description.
 *
 * `urlLocale` is the language of the URL, not of the rendered text. They
 * differ on purpose for one visitor: someone whose browser asks for English
 * and lands on `/` reads English, but `/` is still the Spanish URL, and its
 * canonical must say so or Google would see two URLs claiming one language.
 */
export function marketingMetadata({
  page,
  urlLocale,
  title,
  description,
}: {
  page: MarketingPage;
  urlLocale: Locale;
  title: string;
  description: string;
}): Metadata {
  const url = localizedPath(page, urlLocale);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url, languages: languageAlternates(page) },
    openGraph: {
      type: "website",
      siteName: "Morchitask",
      url,
      title,
      description,
      locale: urlLocale === "es" ? "es_AR" : "en_US",
      alternateLocale: urlLocale === "es" ? ["en_US"] : ["es_AR"],
    },
    // No `images` here: `app/(marketing)/opengraph-image.tsx` is picked up by
    // file convention and wins over anything set in this object. X falls back
    // to og:image when twitter:image is absent.
    twitter: { card: "summary_large_image", title, description },
  };
}

// ---------------------------------------------------------------- JSON-LD

const ORG_ID = `${SITE_URL}/#organization`;

export function organizationJsonLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: "Morchitask",
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    description,
  };
}

/**
 * The product, with its real price.
 *
 * Deliberately WITHOUT `aggregateRating` or `review`. Google shows stars from
 * those, and there are no reviews to back them: inventing a rating is both a
 * structured-data policy violation (a manual action takes the whole site out
 * of rich results) and a lie on the first thing a stranger sees. A test pins
 * its absence.
 */
export function softwareApplicationJsonLd({
  urlLocale,
  description,
}: {
  urlLocale: Locale;
  description: string;
}) {
  const url = `${SITE_URL}${localizedPath("/", urlLocale)}`;
  const offer = (price: number, unitCode: "MON" | "ANN") => ({
    "@type": "Offer",
    price: price.toFixed(2),
    priceCurrency: "USD",
    url: `${SITE_URL}${localizedPath("/pricing", urlLocale)}`,
    // A recurring price, so a machine reading "80" does not take it as 80
    // per month.
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: price.toFixed(2),
      priceCurrency: "USD",
      billingDuration: 1,
      unitCode,
    },
  });

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Morchitask",
    url,
    description,
    inLanguage: urlLocale,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "ProductivityApplication",
    operatingSystem: "Web, iOS, Android",
    publisher: { "@id": ORG_ID },
    offers: [offer(PRICE_MONTHLY_USD, "MON"), offer(PRICE_YEARLY_USD, "ANN")],
    // The trial is free but the product is not. A $0 offer for the trial would
    // read as "free app" in a results page, which is the one thing this
    // pricing exists to not be.
    isAccessibleForFree: false,
  };
}

/** FAQPage from the same question/answer pairs the page renders, so the
 *  structured data can never claim an answer the visitor cannot see. */
export function faqJsonLd(items: { q: string; a: string }[], urlLocale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: urlLocale,
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/**
 * Serializes JSON-LD for a `<script>` tag. `<` is escaped because the answers
 * are catalog text: a stray `</script>` in a translation would otherwise end
 * the tag and spill the rest into the page as markup.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
