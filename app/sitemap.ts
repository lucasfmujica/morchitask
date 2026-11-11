import type { MetadataRoute } from "next";
import { languageAlternates, localizedPath, MARKETING_PAGES, SITE_URL } from "@/lib/seo";
import { LOCALES } from "@/lib/locale";

/**
 * Both languages of every marketing page, each carrying the full hreflang set.
 *
 * Listing `/en/...` here matters more than it looks: nothing on the site links
 * to an English URL for a crawler that renders the Spanish default, so the
 * sitemap is how Google finds that the English pages exist at all.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Same shape the canonical tags resolve to (root with its slash), so the
  // sitemap and the page never disagree about which URL is the page.
  const abs = (path: string) => new URL(path, `${SITE_URL}/`).toString();

  return MARKETING_PAGES.flatMap((page) => {
    const languages = Object.fromEntries(
      Object.entries(languageAlternates(page)).map(([lang, path]) => [lang, abs(path)]),
    );
    return LOCALES.map((locale) => ({
      url: abs(localizedPath(page, locale)),
      changeFrequency:
        page === "/privacy" || page === "/terms" ? ("yearly" as const) : ("monthly" as const),
      priority: page === "/" ? 1 : page === "/pricing" ? 0.8 : 0.3,
      alternates: { languages },
    }));
  });
}
