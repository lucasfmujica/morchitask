import type { CSSProperties } from "react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/seo/json-ld";
import {
  PRICE_MONTHLY_USD,
  PRICE_YEARLY_USD,
  SUNSAMA_MONTHLY_USD,
  TRIAL_DAYS,
  YEARLY_SAVING_PCT,
} from "@/lib/pricing";
import { faqJsonLd } from "@/lib/seo";
import { getUrlLocale, getUsd, pricingMetadata } from "@/lib/seo-server";
import { PlanPrice } from "./plan-price";

export const generateMetadata = pricingMetadata;

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

/** The canvas's check: white tick on the "it fits" gradient. */
function FitCheck() {
  return (
    <span className="mt-px flex size-[22px] flex-none items-center justify-center rounded-full bg-fit text-on-primary">
      <svg
        width="11"
        height="11"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m3.5 8.5 3 3 6-7" />
      </svg>
    </span>
  );
}

/**
 * One plan, one price, and the reasoning next to it.
 *
 * The "why there's no free plan" tile is here on purpose. Every visitor who
 * gets to a pricing page is already asking that question; answering it in the
 * open converts better than pretending it wasn't asked, and it is the honest
 * version of the decision the launch plan made.
 *
 * Every number comes from `lib/pricing.ts`. The comparison bar's width is
 * derived too, so the day either price moves, the picture moves with it
 * instead of still showing "half".
 */
export default async function PricingPage() {
  const t = await getTranslations("pricing");
  const locale = await getLocale();
  const usd = await getUsd();

  // "about US$6.70 a month": rounded to ten cents because the copy says
  // "about", and an exact 6.67 next to "about" reads like a calculator.
  const perMonthOfYear = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.round((PRICE_YEARLY_USD / 12) * 10) / 10);

  const includes = [
    t("incRitual"),
    t("incBlocking"),
    t("incCalendar"),
    t("incShare"),
    t("incFocus"),
    t("incCapture"),
    t("incRoutines"),
    t("incPwa"),
  ];

  const faqs = [
    { q: t("faqCancelQ"), a: t("faqCancelA") },
    { q: t("faqDataQ"), a: t("faqDataA") },
    { q: t("faqTeamQ"), a: t("faqTeamA") },
    { q: t("faqTrialQ", { days: TRIAL_DAYS }), a: t("faqTrialA", { days: TRIAL_DAYS }) },
  ];

  const top = Math.max(PRICE_MONTHLY_USD, SUNSAMA_MONTHLY_USD);
  const bars = [
    {
      name: t("compareUs"),
      price: usd(PRICE_MONTHLY_USD),
      width: (PRICE_MONTHLY_USD / top) * 100,
      fill: "bg-linear-to-r from-fit-from to-primary text-on-primary",
      label: "text-fg",
      delayMs: 400,
    },
    {
      name: t("compareSunsama"),
      price: usd(SUNSAMA_MONTHLY_USD),
      width: (SUNSAMA_MONTHLY_USD / top) * 100,
      fill: "bg-border text-fg",
      label: "text-muted",
      delayMs: 600,
    },
  ];

  const pad = "mx-auto w-full max-w-[1280px] px-4 min-[901px]:px-8";
  const cta =
    "h-[58px] items-center justify-center gap-2.5 rounded-full bg-ink text-base font-semibold text-on-ink no-underline animate-glow transition-transform duration-200 hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus";

  return (
    <div className="text-fg tabular-nums">
      <JsonLd data={faqJsonLd(faqs, await getUrlLocale())} />

      <section aria-labelledby="pricing-h1" className={`${pad} flex flex-col gap-4 pt-10 pb-8`}>
        <h1
          id="pricing-h1"
          className="m-0 animate-up font-display text-[56px] leading-[56px] font-extrabold tracking-[-0.045em] min-[901px]:text-[88px] min-[901px]:leading-[84px]"
        >
          {t("title")}
        </h1>
        <p
          className="m-0 max-w-[560px] animate-up text-xl leading-[30px] text-muted"
          style={delay(120)}
        >
          {t("subtitle")}
        </p>
      </section>

      <section aria-label={t("planRegion")} className={`${pad} pt-4 pb-24`}>
        <div className="grid grid-cols-1 gap-3 min-[901px]:grid-cols-12">
          {/* The plan: mint wash, price, the one button that matters. */}
          <div
            className="flex animate-up flex-col gap-[18px] rounded-[32px] bg-linear-to-b from-wash-mint via-wash-mint-2 via-55% to-surface p-8 min-[901px]:col-span-5"
            style={delay(200)}
          >
            <PlanPrice
              groupLabel={t("periodLabel")}
              monthly={{
                label: t("monthly"),
                price: usd(PRICE_MONTHLY_USD),
                per: t("perMonth"),
              }}
              yearly={{
                label: t("yearly"),
                price: usd(PRICE_YEARLY_USD),
                per: t("perYearApprox", { monthly: usd(perMonthOfYear) }),
              }}
              savingTag={t("savingTag", { pct: YEARLY_SAVING_PCT })}
            />
            <Link href="/login" className={`mt-2 flex ${cta}`}>
              {t("cta", { days: TRIAL_DAYS })}
            </Link>
            <span className="text-center text-sm text-muted">{t("ctaNote")}</span>
          </div>

          <div className="rounded-[32px] bg-surface-2 p-2 min-[901px]:col-span-7">
            <div className="flex h-full flex-col gap-[18px] rounded-[26px] bg-surface p-7">
              <h2 className="m-0 font-display text-2xl font-bold tracking-[-0.02em]">
                {t("includesTitle")}
              </h2>
              {/* Two columns from `sm` up. The canvas keeps two even at phone
                  width, which squeezes each item to ~12 characters a line. */}
              <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-3.5 p-0 sm:grid-cols-2">
                {includes.map((item, i) => (
                  <li
                    key={item}
                    className="flex animate-up items-start gap-2.5 text-[15px] leading-[22px]"
                    style={delay(250 + i * 50)}
                  >
                    <FitCheck />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-[32px] bg-surface-2 p-2 min-[901px]:col-span-8">
            <div className="flex flex-col gap-4 rounded-[26px] bg-surface p-7">
              <h2 className="m-0 font-display text-2xl font-bold tracking-[-0.02em]">
                {t("compareTitle")}
              </h2>
              {bars.map((bar) => (
                <div key={bar.name} className="flex items-center gap-3.5">
                  <span className={`w-[110px] flex-none font-bold ${bar.label}`}>{bar.name}</span>
                  <div className="h-[38px] flex-1 overflow-hidden rounded-full bg-bg">
                    <div
                      className={`flex h-full animate-fill items-center justify-end rounded-full pr-3.5 font-mono text-[13px] ${bar.fill}`}
                      style={{ width: `${bar.width}%`, ...delay(bar.delayMs) }}
                    >
                      {bar.price}
                    </div>
                  </div>
                </div>
              ))}
              <p className="m-0 text-[15px] leading-[23px] text-muted">{t("compareBody")}</p>
            </div>
          </div>

          {/* Dark in both themes: --ink sinks below --bg in dark mode rather
              than inverting into a light slab. */}
          <div className="flex flex-col gap-3 rounded-[32px] bg-ink p-7 text-on-ink min-[901px]:col-span-4">
            <h2 className="m-0 font-display text-2xl font-bold tracking-[-0.02em]">
              {t("whyTitle")}
            </h2>
            <p className="m-0 text-[15px] leading-[23px] text-on-ink/75">
              {t("whyBody", { days: TRIAL_DAYS })}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="pricing-faq" className={`${pad} flex flex-wrap gap-16 pb-24`}>
        <h2
          id="pricing-faq"
          className="m-0 flex-[1_1_300px] font-display text-5xl leading-[50px] font-extrabold tracking-[-0.035em]"
        >
          {t("faqTitle")}
        </h2>
        {/* Native <details>: keyboard, screen readers and find-in-page all work
            with no script, and the answers stay in the HTML that the FAQPage
            JSON-LD above describes. */}
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-2">
          {faqs.map(({ q, a }) => (
            <details key={q} className="group rounded-[22px] bg-surface px-[22px] shadow-tile">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-[22px] text-[17px] font-bold focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
                {q}
                <span
                  aria-hidden="true"
                  className="flex size-[30px] flex-none items-center justify-center rounded-full bg-surface-2 transition-transform duration-200 group-open:rotate-45"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                </span>
              </summary>
              <p className="m-0 mb-5 text-base leading-[25px] text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="pricing-final" className={`${pad} pb-16`}>
        <div className="flex flex-col items-center gap-5 rounded-[40px] bg-linear-160 from-wash-mint via-wash-mint-2 via-40% to-wash-peach px-8 py-[88px] text-center">
          <h2
            id="pricing-final"
            className="m-0 max-w-[820px] font-display text-[56px] leading-[56px] font-extrabold tracking-[-0.045em] min-[901px]:text-[72px] min-[901px]:leading-[70px]"
          >
            {t("finalTitle", { days: TRIAL_DAYS })}
          </h2>
          <p className="m-0 max-w-[560px] text-lg leading-[27px] text-muted">
            {t("finalBody", { days: TRIAL_DAYS })}
          </p>
          <Link href="/login" className={`mt-2 inline-flex px-[30px] ${cta}`}>
            {t("finalCta", { days: TRIAL_DAYS })}
          </Link>
        </div>
      </section>
    </div>
  );
}
