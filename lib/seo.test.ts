import { describe, expect, it } from "vitest";
import { PRICE_MONTHLY_USD, PRICE_YEARLY_USD } from "@/lib/pricing";
import {
  faqJsonLd,
  languageAlternates,
  localizedPath,
  marketingMetadata,
  MARKETING_PAGES,
  serializeJsonLd,
  softwareApplicationJsonLd,
  stripEnglishPrefix,
} from "@/lib/seo";

describe("localized marketing URLs", () => {
  it("keeps Spanish unprefixed and puts English under /en", () => {
    expect(localizedPath("/", "es")).toBe("/");
    expect(localizedPath("/", "en")).toBe("/en");
    expect(localizedPath("/pricing", "en")).toBe("/en/pricing");
    expect(localizedPath("/terms", "es")).toBe("/terms");
  });

  it("round-trips every marketing page through the proxy's prefix stripping", () => {
    for (const page of MARKETING_PAGES) {
      expect(stripEnglishPrefix(localizedPath(page, "en"))).toBe(page);
    }
  });

  it("never turns an English-looking URL into an app route", () => {
    // `/en/today` must stay a 404, not quietly become the app with a header.
    expect(stripEnglishPrefix("/en/today")).toBeNull();
    expect(stripEnglishPrefix("/en/api/tasks")).toBeNull();
    expect(stripEnglishPrefix("/english")).toBeNull();
    expect(stripEnglishPrefix("/pricing")).toBeNull();
  });

  it("declares x-default as the Spanish URL, which is what a bare crawler gets", () => {
    expect(languageAlternates("/pricing")).toEqual({
      es: "/pricing",
      en: "/en/pricing",
      "x-default": "/pricing",
    });
  });
});

describe("marketingMetadata", () => {
  it("makes the canonical follow the URL's language, not the rendered text's", () => {
    const es = marketingMetadata({ page: "/", urlLocale: "es", title: "x", description: "y" });
    const en = marketingMetadata({ page: "/", urlLocale: "en", title: "x", description: "y" });
    expect(es.alternates?.canonical).toBe("/");
    expect(en.alternates?.canonical).toBe("/en");
    expect(en.alternates?.languages).toEqual(languageAlternates("/"));
  });
});

describe("SoftwareApplication JSON-LD", () => {
  const ld = softwareApplicationJsonLd({ urlLocale: "es", description: "d" });

  it("quotes the price from lib/pricing, in USD", () => {
    const prices = ld.offers.map((o) => Number(o.price));
    expect(prices).toEqual([PRICE_MONTHLY_USD, PRICE_YEARLY_USD]);
    for (const offer of ld.offers) expect(offer.priceCurrency).toBe("USD");
  });

  it("emits no rating or reviews, because there are none", () => {
    // Fabricated stars are a structured-data policy violation and a lie.
    const json = JSON.stringify(ld);
    expect(json).not.toMatch(/aggregateRating|ratingValue|"review"|reviewCount/i);
  });

  it("does not present the product as free", () => {
    expect(ld.offers.every((o) => Number(o.price) > 0)).toBe(true);
    expect(ld.isAccessibleForFree).toBe(false);
  });
});

describe("FAQPage JSON-LD", () => {
  it("is built from the same pairs the page renders", () => {
    const ld = faqJsonLd([{ q: "Q?", a: "A." }], "en");
    expect(ld.mainEntity).toEqual([
      { "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } },
    ]);
  });
});

describe("serializeJsonLd", () => {
  it("cannot be closed early by catalog text", () => {
    const out = serializeJsonLd({ a: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)).toEqual({ a: "</script><script>alert(1)</script>" });
  });
});
