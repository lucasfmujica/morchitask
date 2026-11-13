import "server-only";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/locale";
import { PRICE_MONTHLY_USD, PRICE_YEARLY_USD, TRIAL_DAYS, formatUsd } from "@/lib/pricing";
import {
  marketingMetadata,
  organizationJsonLd,
  softwareApplicationJsonLd,
  URL_LOCALE_HEADER,
  type MarketingPage,
} from "@/lib/seo";

/**
 * Which language the URL is in: `en` when `proxy.ts` rewrote an `/en/...`
 * request, Spanish otherwise. Not the rendered language (see
 * `marketingMetadata`): this one decides canonicals and hreflang.
 */
export async function getUrlLocale(): Promise<Locale> {
  return (await headers()).get(URL_LOCALE_HEADER) === "en" ? "en" : "es";
}

/** `formatUsd` bound to the rendered language, for the server pages that
 *  format several prices. Once its own spelling in the catalog
 *  (`pricing.usd`), which is how /pricing said "US$10" while the billing
 *  screen, on `formatUsd`, said "$10". */
export async function getUsd() {
  const locale = await getLocale();
  return (amount: number) => formatUsd(amount, locale);
}

async function homeDescription() {
  const t = await getTranslations("seo");
  const usd = await getUsd();
  return t("homeDescription", { price: usd(PRICE_MONTHLY_USD), days: TRIAL_DAYS });
}

/** Metadata for the landing. Called from `app/(marketing)/page.tsx`. */
export async function homeMetadata(): Promise<Metadata> {
  const t = await getTranslations("seo");
  return marketingMetadata({
    page: "/",
    urlLocale: await getUrlLocale(),
    title: t("homeTitle"),
    description: await homeDescription(),
  });
}

export async function pricingMetadata(): Promise<Metadata> {
  const t = await getTranslations("seo");
  const usd = await getUsd();
  const price = usd(PRICE_MONTHLY_USD);
  return marketingMetadata({
    page: "/pricing",
    urlLocale: await getUrlLocale(),
    title: t("pricingTitle", { price, days: TRIAL_DAYS }),
    description: t("pricingDescription", {
      price,
      yearly: usd(PRICE_YEARLY_USD),
      days: TRIAL_DAYS,
    }),
  });
}

/** For pages whose title and description are already written elsewhere
 *  (the legal pages): adds canonical, hreflang and the social cards. */
export async function pageMetadata(
  page: MarketingPage,
  title: string,
  description: string,
): Promise<Metadata> {
  return marketingMetadata({ page, urlLocale: await getUrlLocale(), title, description });
}

/** JSON-LD for the landing: the product and who makes it. Render it with
 *  `<JsonLd data={await homeJsonLd()} />`. */
export async function homeJsonLd() {
  const t = await getTranslations("seo");
  return [
    organizationJsonLd(t("orgDescription")),
    softwareApplicationJsonLd({
      urlLocale: await getUrlLocale(),
      description: await homeDescription(),
    }),
  ];
}
