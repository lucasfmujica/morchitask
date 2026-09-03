import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatUsd, PRICE_MONTHLY_USD, TRIAL_DAYS } from "@/lib/pricing";
import { capacityState } from "@/lib/capacity";
import { formatMinutes } from "@/lib/format";
import { Bezel, CAPACITY_MIN, CapacityMeter, PLANNED_MIN, TodayFrame } from "./product-frames";

/**
 * The fold.
 *
 * Split: the ritual on the left, the day on the right, running to the edge of
 * the screen. Three things here are the page's whole visual vocabulary, and
 * every surface below repeats them.
 *
 *  - **The accent rule.** A short line in the accent above a heading, so a
 *    column never opens on 40px type sitting on nothing.
 *  - **The bezel.** Product frames are objects, not rectangles: a soft outer
 *    frame and a real elevation ramp. See `Bezel` for why that is worth
 *    breaking a DESIGN.md rule over.
 *  - **A warm field.** One directional wash anchored to the corner the product
 *    occupies, over a canvas tinted a few percent toward the accent.
 *
 * And the capacity bar is promoted out of the screenshot onto the page itself,
 * at hero size, under the CTA. DESIGN.md allows exactly this and the landing
 * had never used it. It fills the left column with the one thing on this page
 * a competitor cannot copy, and it states the mechanic before anyone scrolls.
 * That it also appears inside the frame is deliberate: the concept, then the
 * same thing inside the product.
 */
export async function Fold() {
  const [t, td] = await Promise.all([getTranslations("marketing"), getTranslations("day")]);
  const { overByMin } = capacityState(PLANNED_MIN, CAPACITY_MIN);

  return (
    <section
      className="relative isolate overflow-hidden"
      style={{ background: "color-mix(in srgb, var(--accent) 3.5%, var(--bg))" }}
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(72% 66% at 92% -8%, color-mix(in srgb, var(--accent) 20%, var(--accent-soft)), transparent 56%), radial-gradient(50% 46% at 30% 104%, color-mix(in srgb, var(--primary) 12%, var(--primary-soft)), transparent 60%)",
        }}
        aria-hidden
      />

      <div className="mx-auto w-full max-w-5xl px-5 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
          <div>
            <p className="flex items-center gap-3 text-2xs font-semibold tracking-[0.16em] text-muted uppercase">
              <span className="h-px w-7 shrink-0 bg-accent" aria-hidden />
              {t("footerTagline")}
            </p>

            {/* Three moments, three lines. Separate sentences rather than one
                string with breaks in it: where a line lands is a typographic
                decision, and a translation gets to make its own.

                2.875rem is not a taste call, it is the ceiling two constraints
                leave: the longest line ("Planificá la mañana.") measures 448px
                at this size, and the frame beside it only clears half the
                viewport while this column plus its gap stay under 492px. Going
                bigger means the product drops below half the screen — 56px puts
                it at 42%, 64px at 37%. */}
            <h1 className="mt-6 text-[2.125rem] leading-[1.04] font-extrabold tracking-[-0.035em] text-fg sm:text-[2.5rem] lg:text-[2.875rem]">
              <span className="block">{t("heroTitlePlan")}</span>
              <span className="block">{t("heroTitleSchedule")}</span>
              <span className="block">{t("heroTitleClose")}</span>
            </h1>

            <p className="mt-6 max-w-[25rem] text-[1.0625rem] leading-[1.6] text-muted">
              {t("heroSubtitle")}
            </p>

            {/* Two short facts beside the button rather than one sentence
                carrying both: they are read, not parsed. */}
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

            <div className="mt-10 border-t border-border pt-6">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-2xs font-semibold tracking-[0.14em] text-muted uppercase">
                  {td("capacity")}
                </span>
                <span className="flex items-baseline gap-2 text-sm font-semibold text-danger">
                  <span className="tabular-nums">
                    {formatMinutes(PLANNED_MIN)} {"/"} {formatMinutes(CAPACITY_MIN)}
                  </span>
                  <span className="rounded-pill bg-danger/12 px-2 py-0.5 text-2xs font-bold tabular-nums">
                    {"+"}
                    {formatMinutes(overByMin)}
                  </span>
                </span>
              </div>
              <div className="mt-3">
                <CapacityMeter plannedMin={PLANNED_MIN} targetMin={CAPACITY_MIN} height="h-2.5" />
              </div>
            </div>
          </div>

          {/* Sized to land exactly on the right edge of the viewport: the column
              starts at half the gutter plus the text column, so `50vw + 2.25rem`
              meets the edge at every width and the day is always a little over
              half the screen. A frame cut short of the edge reads as a bug. */}
          <div className="lg:w-[calc(50vw+0.25rem)]">
            <Bezel lift="lg">
              <TodayFrame />
            </Bezel>
          </div>
        </div>
      </div>
    </section>
  );
}
