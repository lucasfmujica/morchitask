import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  formatUsd,
  PRICE_MONTHLY_USD,
  PRICE_YEARLY_USD,
  SUNSAMA_MONTHLY_USD,
  TRIAL_DAYS,
  YEARLY_SAVING_PCT,
} from "@/lib/pricing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricing");
  return { title: `${t("title")} · Morchitask`, description: t("subtitle") };
}

/**
 * One plan, one price, and the reasoning next to it.
 *
 * The "why there's no free plan" section is here on purpose. Every visitor who
 * gets to a pricing page is already asking that question; answering it in the
 * open converts better than pretending it wasn't asked, and it is the honest
 * version of the decision the launch plan made.
 */
export default async function PricingPage() {
  const t = await getTranslations("pricing");

  const included = [
    t("incRitual"),
    t("incBlocking"),
    t("incCalendar"),
    t("incShare"),
    t("incFocus"),
    t("incRoutines"),
    t("incPwa"),
    t("incLangs"),
  ];

  const faqs = [
    { q: t("faqTrialQ", { days: TRIAL_DAYS }), a: t("faqTrialA", { days: TRIAL_DAYS }) },
    { q: t("faqCancelQ"), a: t("faqCancelA") },
    { q: t("faqDataQ"), a: t("faqDataA") },
    { q: t("faqTeamQ"), a: t("faqTeamA") },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-20">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 text-balance text-lg text-muted">{t("subtitle")}</p>
      </header>

      <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
        {/* The price card. rhea's signature: generous radius, a hairline ring
            instead of a heavy border, restrained shadow. */}
        <section className="rounded-2xl bg-surface p-6 shadow-card ring-1 ring-border sm:p-7">
          <p className="text-sm font-semibold text-muted">{t("planName")}</p>

          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-5xl font-extrabold tracking-tight tabular-nums text-fg">
              {formatUsd(PRICE_MONTHLY_USD)}
            </span>
            <span className="text-sm text-muted">{t("perMonth")}</span>
          </div>

          <p className="mt-2 text-sm text-muted">
            {t("yearlyLine", {
              price: formatUsd(PRICE_YEARLY_USD),
              pct: YEARLY_SAVING_PCT,
            })}
          </p>

          <Link
            href="/login"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-[color,box-shadow] duration-200 hover:bg-primary-hover focus-visible:ring-3 focus-visible:ring-focus/30 focus-visible:outline-none"
          >
            {t("cta", { days: TRIAL_DAYS })}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <p className="mt-2.5 text-center text-xs text-subtle">{t("ctaNote")}</p>
        </section>

        {/* What's included */}
        <section className="rounded-2xl bg-surface p-6 shadow-soft ring-1 ring-border sm:p-7">
          <h2 className="text-sm font-bold text-fg">{t("includesTitle")}</h2>
          <ul className="mt-4 flex flex-col gap-2.5">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-muted">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Why no free plan */}
      <section className="mt-14 max-w-3xl">
        <h2 className="text-xl font-extrabold tracking-tight text-fg">{t("whyTitle")}</h2>
        <p className="mt-3 text-balance text-muted">{t("whyBody", { days: TRIAL_DAYS })}</p>
      </section>

      {/* Comparison */}
      <section className="mt-14">
        <h2 className="text-xl font-extrabold tracking-tight text-fg">{t("compareTitle")}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-primary-soft p-5 ring-1 ring-primary/25">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-bold text-fg">{t("compareUs")}</p>
              <p className="font-extrabold tabular-nums text-primary">
                {formatUsd(PRICE_MONTHLY_USD)}
              </p>
            </div>
            <p className="mt-2 text-sm text-muted">{t("compareUsBody")}</p>
          </div>
          <div className="rounded-2xl bg-surface p-5 ring-1 ring-border">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-bold text-fg">{t("compareSunsama")}</p>
              <p className="font-extrabold tabular-nums text-muted">
                {formatUsd(SUNSAMA_MONTHLY_USD)}
              </p>
            </div>
            <p className="mt-2 text-sm text-muted">{t("compareSunsamaBody")}</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-14 max-w-3xl">
        <h2 className="text-xl font-extrabold tracking-tight text-fg">{t("faqTitle")}</h2>
        <dl className="mt-5 flex flex-col divide-y divide-border rounded-2xl bg-surface px-5 ring-1 ring-border">
          {faqs.map(({ q, a }) => (
            <div key={q} className="py-4">
              <dt className="text-sm font-semibold text-fg">{q}</dt>
              <dd className="mt-1.5 text-sm text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
