import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatUsd, PRICE_MONTHLY_USD, TRIAL_DAYS } from "@/lib/pricing";
import {
  AgendaFrame,
  PlanFrame,
  ShutdownFrame,
  TodayFrame,
  WeekStrip,
} from "@/components/marketing/product-frames";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing");
  return { title: "Morchitask", description: t("heroSubtitle") };
}

/**
 * The landing page: five surfaces, in this order, and nothing else.
 *
 *   1. the fold          the ritual, and a day that is 45 minutes over budget
 *   2. the ritual        three moments, one frame each
 *   3. the week          five days at full width
 *   4. the honesty       what it does not do, as prose
 *   5. the price         why it costs half, and the last CTA
 *
 * Two decisions are load-bearing and easy to undo by accident.
 *
 * The product imagery is not screenshots — see `components/marketing/
 * product-frames.tsx`. The frames are the real screens rebuilt from the app's
 * own tokens, catalog and capacity maths, which is why the fold can put a live
 * over-budget capacity bar on the page instead of a picture of one.
 *
 * And the page is deliberately not a features grid. What it sells is a routine
 * with an end, so the "what Morchitask does not do" section is set as prose
 * rather than four inverted feature cards: the point is to lose the wrong
 * visitor before they pay, and a card grid reads as a boast even when the words
 * say the opposite.
 */
export default async function LandingPage() {
  const t = await getTranslations("marketing");

  const moments = [
    { title: t("ritualPlanTitle"), body: t("ritualPlanBody"), frame: <PlanFrame /> },
    { title: t("ritualDayTitle"), body: t("ritualDayBody"), frame: <AgendaFrame /> },
    { title: t("ritualCloseTitle"), body: t("ritualCloseBody"), frame: <ShutdownFrame /> },
  ];

  const limits = [
    t("honestNoTeams"),
    t("honestNoAi"),
    t("honestNoOffline"),
    t("honestNoIntegrations"),
  ];

  const priceNote = (
    <p className="text-sm text-subtle">
      {t("heroCtaNote")} {t("priceLine", { price: formatUsd(PRICE_MONTHLY_USD), days: TRIAL_DAYS })}
    </p>
  );

  const cta = (
    <Link
      href="/login"
      className="inline-flex items-center gap-2 rounded-card bg-primary px-6 py-3.5 text-base font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none"
    >
      {t("heroCta")}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );

  return (
    <>
      {/* ── 1. The fold ─────────────────────────────────────────────
          One typographic axis, then the day itself at real scale. The
          capacity bar has to be in here: it is the only visual signature
          this page gets, and it is the whole argument in one gesture. */}
      <section>
        <div className="mx-auto w-full max-w-5xl px-5 pt-16 pb-16 sm:pt-24 sm:pb-20">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-extrabold tracking-tight text-balance text-fg sm:text-5xl lg:text-6xl">
              {t("heroTitle")}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{t("heroSubtitle")}</p>
            <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
              {cta}
              {priceNote}
            </div>
          </div>

          <div className="mt-14 sm:mt-16">
            <TodayFrame />
          </div>
        </div>
      </section>

      {/* ── 2. The ritual ───────────────────────────────────────────
          Three moments, alternating sides, one frame each. No icons and
          no step numbers: the headings already say morning, day, night. */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-5 pt-16 sm:pt-24">
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-fg sm:text-4xl">
            {t("ritualTitle")}
          </h2>
          <p className="mt-4 max-w-xl text-lg text-muted">{t("ritualSubtitle")}</p>
        </div>

        {moments.map((moment, i) => (
          <div key={moment.title} className="mx-auto w-full max-w-5xl px-5 py-14 sm:py-16">
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className={i % 2 === 1 ? "lg:order-2" : undefined}>
                <h3 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
                  {moment.title}
                </h3>
                <p className="mt-4 max-w-md text-base leading-relaxed text-muted">{moment.body}</p>
              </div>
              <div className={i % 2 === 1 ? "lg:order-1" : undefined}>{moment.frame}</div>
            </div>
          </div>
        ))}
      </section>

      {/* ── 3. The week ─────────────────────────────────────────────
          Full width, because the proof that this is not another list is
          that five days fit on the screen with their load on them. */}
      <section className="border-t border-border py-16 sm:py-24">
        <div className="mx-auto w-full max-w-5xl px-5">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight text-balance text-fg sm:text-4xl">
              {t("weekTitle")}
            </h2>
            <p className="mt-4 text-lg text-muted">{t("weekSubtitle")}</p>
          </div>
        </div>
        {/* The only element allowed to run past the page's text column: five
            days only prove the point when all five are on the screen. */}
        <div className="mt-12 w-full px-5">
          <WeekStrip />
        </div>
      </section>

      {/* ── 4. The honesty ──────────────────────────────────────────
          Prose in one column. Deliberately not a 2×2 of cards. */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-24">
          <h2 className="text-3xl font-extrabold tracking-tight text-balance text-fg sm:text-4xl">
            {t("honestTitle")}
          </h2>
          <p className="mt-4 text-lg text-muted">{t("honestSubtitle")}</p>

          <ul className="mt-10 max-w-3xl divide-y divide-border border-t border-border">
            {limits.map((limit) => (
              <li key={limit} className="py-6 text-lg leading-relaxed text-balance text-fg">
                {limit}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 5. The price, and the close ─────────────────────────────
          One light surface. Sunsama is allowed here and nowhere earlier. */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-24">
          <h2 className="text-3xl font-extrabold tracking-tight text-balance text-fg sm:text-4xl">
            {t("compareTitle")}
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{t("compareBody")}</p>
          <Link
            href="/pricing"
            className="mt-5 inline-flex items-center gap-1.5 text-base font-semibold text-primary transition-colors hover:underline"
          >
            {t("navPricing")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>

          <div className="mt-14 max-w-3xl border-t border-border pt-14">
            <h2 className="text-3xl font-extrabold tracking-tight text-balance text-fg sm:text-4xl">
              {t("finalTitle")}
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{t("finalBody")}</p>
            <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
              {cta}
              {priceNote}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
