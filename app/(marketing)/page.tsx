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
          Split: the ritual on the left, the day itself on the right, running
          off the right edge of the viewport at a size you can actually read.
          The product gets the larger half on purpose — this is a planner, and
          the only honest argument for one is what a planned day looks like.

          The capacity bar has to be in here. It is the single visual
          signature this page is allowed, and it is the whole pitch in one
          gesture: teal up to the budget, hatched red past it. */}
      {/* `isolate` is load-bearing: the wash below sits at a negative z-index,
          and without a stacking context here it paints behind the layout's own
          `bg-bg` wrapper and disappears entirely. */}
      <section className="relative isolate overflow-hidden">
        {/* Atmosphere, not a band. Peach off the top corner where the day
            sits, a breath of mint under it. The soft tints alone are a hair
            away from the canvas, so each wash is the token itself over a low
            mix of the colour it comes from — enough to feel warm, never enough
            to read as a colour, and it follows the theme in both directions. */}
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(62% 58% at 80% 4%, color-mix(in srgb, var(--accent) 10%, var(--accent-soft)), transparent 62%), radial-gradient(52% 50% at 56% 88%, color-mix(in srgb, var(--primary) 8%, var(--primary-soft)), transparent 64%)",
          }}
          aria-hidden
        />

        <div className="mx-auto w-full max-w-5xl px-5 pt-14 pb-16 sm:pt-20 sm:pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <div>
              {/* Three moments, three lines. Separate sentences rather than one
                  string with breaks in it: where a line lands is a typographic
                  decision, and a translation gets to make its own. The size is
                  capped so the longest of them ("Planificá la mañana.") holds
                  its line inside the column instead of wrapping to five. */}
              <h1 className="text-[2rem] leading-[1.12] font-extrabold tracking-tight text-fg sm:text-4xl lg:text-[2.5rem]">
                <span className="block">{t("heroTitlePlan")}</span>
                <span className="block">{t("heroTitleSchedule")}</span>
                <span className="block">{t("heroTitleClose")}</span>
              </h1>
              <p className="mt-6 text-base leading-relaxed text-muted">{t("heroSubtitle")}</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
                {cta}
                {priceNote}
              </div>
            </div>

            {/* Sized to land exactly on the right edge of the viewport rather
                than to a round number: the column starts at half the gutter
                plus the text column, so `50vw + 2.25rem` reaches the edge at
                every width and the day is always a little over half the
                screen. A frame cut 30px short of the edge reads as a bug; one
                that meets it reads as the app, docked. */}
            <div className="lg:w-[calc(50vw+2.25rem)]">
              <TodayFrame />
            </div>
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
