import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatUsd, PRICE_MONTHLY_USD, TRIAL_DAYS } from "@/lib/pricing";
import { Fold } from "@/components/marketing/fold";
import {
  AgendaFrame,
  Bezel,
  PlanFrame,
  ShutdownFrame,
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
 * Three things hold the page together, all of them set in `components/
 * marketing/fold.tsx` and repeated here.
 *
 * **Surfaces alternate.** Warm canvas, white, canvas, white, warm again. Five
 * identical slabs separated by hairlines is what made the page read as a
 * document rather than as a designed thing; giving each surface an identity
 * costs nothing and does most of the work.
 *
 * **Every heading opens on an accent rule** instead of on nothing. It is a
 * device, not decoration: it also spares the page the section eyebrows that
 * would mean inventing copy COPY.md does not have.
 *
 * **Product frames sit in a bezel.** See `Bezel` in product-frames.tsx.
 *
 * Two older decisions still stand. The imagery is not screenshots — the frames
 * are the real screens rebuilt from the app's own tokens, catalog and capacity
 * maths. And "what Morchitask does not do" is prose, not a grid of cards: the
 * point is to lose the wrong visitor before they pay, and a card grid reads as
 * a boast even when the words say the opposite.
 */

/** The page's one recurring mark: a short rule in the accent above a heading. */
function Rule() {
  return <span className="mb-6 block h-px w-7 bg-accent" aria-hidden />;
}

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

  const heading =
    "text-[1.75rem] leading-[1.15] font-extrabold tracking-[-0.03em] text-fg sm:text-[2.125rem]";

  return (
    <>
      <Fold />

      {/* ── 2. The ritual ───────────────────────────────────────────
          White, so the three moments read as their own chapter. No icons
          and no step numbers: the headings already say morning, day, night,
          and a numbered list would be decoration on top of that. */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-5xl px-5 pt-20 sm:pt-28">
          <Rule />
          <h2 className={`max-w-2xl text-balance ${heading}`}>{t("ritualTitle")}</h2>
          <p className="mt-4 max-w-xl text-base leading-[1.65] text-muted">{t("ritualSubtitle")}</p>
        </div>

        {moments.map((moment, i) => {
          const frameFirst = i % 2 === 1;
          // The whole template flips, not just the order. Reordering alone left
          // the frame in the 20rem column on every second row, which squeezed
          // the agenda to a third of its width and ran the prose too wide.
          const text = (
            <div key="text">
              <span className="mb-5 block h-px w-5 bg-accent" aria-hidden />
              <h3 className="text-xl leading-[1.2] font-extrabold tracking-[-0.028em] text-fg sm:text-2xl">
                {moment.title}
              </h3>
              <p className="mt-4 text-base leading-[1.65] text-muted">{moment.body}</p>
            </div>
          );
          const frame = (
            <div key="frame">
              <Bezel>{moment.frame}</Bezel>
            </div>
          );

          return (
            <div key={moment.title} className="mx-auto w-full max-w-5xl px-5 py-14 sm:py-16">
              <div
                className={`grid items-center gap-10 lg:gap-14 ${
                  frameFirst
                    ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]"
                    : "lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"
                }`}
              >
                {frameFirst ? [frame, text] : [text, frame]}
              </div>
            </div>
          );
        })}
      </section>

      {/* ── 3. The week ─────────────────────────────────────────────
          Back to the canvas, and the strip runs past the text column:
          five days only prove the point when all five are on the screen. */}
      <section className="border-t border-border py-20 sm:py-28">
        <div className="mx-auto w-full max-w-5xl px-5">
          <div className="max-w-2xl">
            <Rule />
            <h2 className={`text-balance ${heading}`}>{t("weekTitle")}</h2>
            <p className="mt-4 text-base leading-[1.65] text-muted">{t("weekSubtitle")}</p>
          </div>
        </div>
        <div className="mt-12 w-full px-5">
          <WeekStrip />
        </div>
      </section>

      {/* ── 4. The honesty ──────────────────────────────────────────
          Editorial two-up: the heading holds the left column while the
          admissions run down the right. Still one column of prose, which is
          the part that matters, but the page stops being a stack. */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-5xl px-5 py-20 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-16">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <Rule />
              <h2 className={`text-balance ${heading}`}>{t("honestTitle")}</h2>
              <p className="mt-4 text-base leading-[1.65] text-muted">{t("honestSubtitle")}</p>
            </div>
            <ul className="divide-y divide-border border-t border-border">
              {limits.map((limit) => (
                <li
                  key={limit}
                  className="py-7 text-lg leading-[1.6] tracking-[-0.006em] text-balance text-fg"
                >
                  {limit}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 5. The price, and the close ─────────────────────────────
          The warm field returns, so the page opens and closes on the same
          note instead of trailing off. Sunsama is allowed here and nowhere
          earlier. */}
      <section
        className="relative isolate overflow-hidden border-t border-border"
        style={{ background: "color-mix(in srgb, var(--accent) 3.5%, var(--bg))" }}
      >
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(58% 62% at 12% 108%, color-mix(in srgb, var(--accent) 16%, var(--accent-soft)), transparent 58%), radial-gradient(46% 48% at 88% -8%, color-mix(in srgb, var(--primary) 11%, var(--primary-soft)), transparent 62%)",
          }}
          aria-hidden
        />

        <div className="mx-auto w-full max-w-5xl px-5 py-20 sm:py-28">
          <Rule />
          <h2 className={`max-w-2xl text-balance ${heading}`}>{t("compareTitle")}</h2>
          <p className="mt-5 max-w-2xl text-base leading-[1.7] text-muted">{t("compareBody")}</p>
          <Link
            href="/pricing"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:underline"
          >
            {t("navPricing")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>

          <div className="mt-16 max-w-3xl border-t border-border pt-16">
            <h2 className={`text-balance ${heading}`}>{t("finalTitle")}</h2>
            <p className="mt-5 max-w-xl text-base leading-[1.7] text-muted">{t("finalBody")}</p>
            <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-card bg-primary px-7 py-4 text-base font-semibold text-on-primary shadow-card transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none"
              >
                {t("heroCta")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <div className="text-2xs leading-[1.5] text-subtle">
                <p>{t("heroCtaNote")}</p>
                <p>{t("priceLine", { price: formatUsd(PRICE_MONTHLY_USD), days: TRIAL_DAYS })}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
