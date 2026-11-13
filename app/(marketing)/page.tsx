import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  formatUsd,
  PRICE_MONTHLY_USD,
  PRICE_YEARLY_USD,
  SUNSAMA_MONTHLY_USD,
  TRIAL_DAYS,
} from "@/lib/pricing";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Bento } from "@/components/marketing/bento";
import { RitualPlayer } from "@/components/marketing/ritual-player";
import { ArrowIcon, CheckIcon } from "@/components/marketing/icons";
import { DEMO_DAY } from "@/components/marketing/demo";
import { JsonLd } from "@/components/seo/json-ld";
import { homeJsonLd, homeMetadata } from "@/lib/seo-server";

// Canonical, hreflang (es / en / x-default), Open Graph and Twitter in one
// place, shared with /pricing so the two never disagree about the site URL.
export const generateMetadata: () => Promise<Metadata> = homeMetadata;

/** Section frame: the canvas's 1280 column with a 32px gutter (16 on phones). */
const section = "mx-auto w-full max-w-[1280px] px-4 min-[900px]:px-8";
const h2 = "font-display font-semibold tracking-[-0.015em]";

/** The one primary action, ink, breathing once the hero has settled. */
function TrialCta({
  label,
  arrow,
  className,
}: {
  label: string;
  arrow?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/login"
      className={cn(
        "animate-glow inline-flex h-[58px] items-center gap-2.5 rounded-pill bg-fg px-[30px] text-base font-semibold text-bg transition-colors hover:bg-fg/85 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus",
        className,
      )}
    >
      {label}
      {arrow && <ArrowIcon />}
    </Link>
  );
}

/**
 * The landing page.
 *
 * Built around one bet: this is not competing on features, it is competing
 * on doing less, and on price. So the hero plays the ritual itself, the bento
 * shows each piece of the app working instead of describing it, and a whole
 * section says what the app deliberately does NOT do. That section exists to
 * lose the wrong visitors before they pay, not after: a refund and a bad
 * review both cost more than a bounce.
 */
export default async function LandingPage() {
  const t = await getTranslations("marketing");
  const locale = await getLocale();
  const usd = (amount: number) => formatUsd(amount, locale);
  const price = usd(PRICE_MONTHLY_USD);
  const cta = t("hero.cta", { days: TRIAL_DAYS });
  const left = DEMO_DAY.capacityMin - DEMO_DAY.plannedStripMin;

  const includes = [
    t("price.includeRitual"),
    t("price.includeCalendar"),
    t("price.includeShare"),
    t("price.includeTrial", { days: TRIAL_DAYS }),
  ];
  const limits = [t("honest.teams"), t("honest.ai"), t("honest.offline"), t("honest.integrations")];
  // Bar lengths are the prices themselves, so the picture can't disagree
  // with the numbers printed on it.
  const bars = [
    { name: "Morchitask", amount: PRICE_MONTHLY_USD, ours: true },
    { name: t("price.sunsama"), amount: SUNSAMA_MONTHLY_USD, ours: false },
  ];
  const maxPrice = Math.max(PRICE_MONTHLY_USD, SUNSAMA_MONTHLY_USD);

  return (
    <div id="top" className="isolate">
      <JsonLd data={await homeJsonLd()} />
      {/* 1. Hero: copy left, the day's rituals playing right. */}
      <section aria-labelledby="hero-h" className={cn(section, "pt-8 pb-6")}>
        <div className="flex flex-col gap-8 min-[900px]:flex-row min-[900px]:items-stretch">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-6 py-6">
            <h1 id="hero-h" className="animate-up flex flex-col gap-[18px]">
              <span className="self-start rounded-pill bg-mint-soft px-3 py-1.5 font-mono text-[13px] font-medium tracking-[0.04em] text-primary uppercase">
                {t("hero.eyebrow")}
              </span>
              <span className="font-display text-[56px] leading-[56px] font-semibold tracking-[-0.015em] min-[900px]:text-[92px] min-[900px]:leading-[88px]">
                {t.rich("hero.title", {
                  mark: (chunks) => (
                    // On a phone the sentence wraps, and an absolute swipe would
                    // underline the widest line instead of the words: there the
                    // marker is a background cloned onto each line, no motion.
                    <span className="relative z-0 bg-[linear-gradient(var(--marker),var(--marker))] bg-[length:100%_22px] bg-[position:0_calc(100%-4px)] bg-no-repeat box-decoration-clone min-[900px]:inline-block min-[900px]:bg-none min-[900px]:whitespace-nowrap">
                      {chunks}
                      <span
                        aria-hidden
                        className="animate-swipe absolute -right-1 bottom-1.5 -left-1 -z-10 hidden h-[26px] rounded-[6px] bg-marker min-[900px]:block"
                      />
                    </span>
                  ),
                })}
              </span>
            </h1>
            <p
              className="animate-up max-w-[520px] text-xl leading-[30px] text-muted"
              style={{ animationDelay: "150ms" }}
            >
              {t("hero.subtitle")}
            </p>
            <div
              className="animate-up flex flex-wrap items-center gap-[18px]"
              style={{ animationDelay: "300ms" }}
            >
              <TrialCta label={cta} arrow />
              <span className="text-sm leading-5 text-muted">
                {t.rich("hero.note", { price, br: () => <br /> })}
              </span>
            </div>
          </div>
          <RitualPlayer />
        </div>
      </section>

      {/* The signature, full width: today's capacity. */}
      <section aria-label={t("capacity.label")} className={cn(section, "pb-24")}>
        <div className="rounded-[28px] bg-surface-2 p-2">
          <div className="flex flex-wrap items-center gap-6 rounded-[22px] bg-surface px-6 py-5 shadow-tile">
            <span className="font-display text-[30px] font-semibold tracking-[-0.01em]">
              {t.rich("capacity.planned", {
                planned: formatMinutes(DEMO_DAY.plannedStripMin),
                capacity: formatMinutes(DEMO_DAY.capacityMin),
                of: (chunks) => (
                  <span className="font-sans text-base font-semibold tracking-normal text-muted">
                    {chunks}
                  </span>
                ),
              })}
            </span>
            <div className="flex flex-[1_1_320px] flex-col gap-2">
              <div className="h-2.5 overflow-hidden rounded-pill bg-surface-2">
                <div
                  className="animate-fill bg-fit-bar h-full rounded-pill"
                  style={{
                    width: `${(DEMO_DAY.plannedStripMin / DEMO_DAY.capacityMin) * 100}%`,
                    animationDelay: "0.4s",
                  }}
                />
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 text-xs">
                <span className="font-semibold text-primary">
                  {t("capacity.fits", { left: formatMinutes(left) })}
                </span>
                <span className="text-muted">
                  {t("capacity.done", { done: DEMO_DAY.doneStrip, total: DEMO_DAY.totalStrip })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Bento: what it does, each tile a working piece of the app. */}
      <section
        id="como"
        aria-labelledby="como-h"
        className={cn(section, "flex scroll-mt-6 flex-col gap-9 pb-28")}
      >
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2
            id="como-h"
            className={cn(
              h2,
              "max-w-[720px] text-[36px] leading-[38px] min-[900px]:text-[56px] min-[900px]:leading-[56px]",
            )}
          >
            {t("bento.title")}
          </h2>
          <p className="max-w-[380px] text-[17px] leading-[26px] text-muted">{t("bento.lede")}</p>
        </div>
        <Bento />
      </section>

      {/* 3. Price, honest. One light surface, no dark band. */}
      <section id="precio" aria-labelledby="precio-h" className={cn(section, "scroll-mt-6 pb-28")}>
        <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-12">
          <div className="rounded-[28px] bg-surface-2 p-2 min-[900px]:col-span-7">
            <div className="flex h-full flex-col gap-[22px] rounded-[22px] bg-surface p-6 min-[900px]:p-9">
              <h2
                id="precio-h"
                className={cn(
                  h2,
                  "text-[36px] leading-[38px] min-[900px]:text-5xl min-[900px]:leading-[50px]",
                )}
              >
                {t("price.title")}
              </h2>
              <p className="max-w-[560px] text-[17px] leading-[26px] text-muted">
                {t("price.body", {
                  sunsama: usd(SUNSAMA_MONTHLY_USD),
                  price,
                })}
              </p>
              <div aria-hidden className="mt-auto flex flex-col gap-3">
                {bars.map((b, i) => (
                  <div key={b.name} className="flex items-center gap-3.5">
                    <span className={cn("w-[110px] font-bold", !b.ours && "text-muted")}>
                      {b.name}
                    </span>
                    <div className="h-[34px] flex-1 overflow-hidden rounded-pill bg-bg">
                      <div
                        className={cn(
                          "animate-fill flex h-full items-center justify-end rounded-pill pr-3.5 font-mono text-[13px]",
                          b.ours ? "bg-fit-bar text-on-primary" : "bg-border",
                        )}
                        style={{
                          width: `${(b.amount / maxPrice) * 100}%`,
                          animationDelay: `${0.4 + i * 0.2}s`,
                        }}
                      >
                        {t("price.amount", { price: usd(b.amount) })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3.5 rounded-[28px] bg-[linear-gradient(180deg,var(--wash-mint),var(--wash-mint-2)_50%,var(--bg))] p-6 min-[900px]:col-span-5 min-[900px]:p-9">
            <span className="font-display text-[72px] leading-[68px] font-semibold tracking-[-0.02em] min-[900px]:text-[88px] min-[900px]:leading-[80px]">
              {t("price.amount", { price })}
            </span>
            <span className="text-base font-semibold text-on-wash">
              {t("price.per", { yearly: usd(PRICE_YEARLY_USD) })}
            </span>
            <ul
              aria-label={t("price.includesLabel")}
              className="mt-2 flex flex-col gap-2.5 text-[15px]"
            >
              {includes.map((inc) => (
                <li key={inc} className="flex items-center gap-2.5">
                  <span className="bg-fit flex h-5 w-5 flex-none items-center justify-center rounded-pill text-on-primary">
                    <CheckIcon size={10} />
                  </span>
                  {inc}
                </li>
              ))}
            </ul>
            <Link
              href="/pricing"
              className="mt-auto pt-4 text-[15px] font-semibold text-fg underline-offset-4 hover:text-primary hover:underline"
            >
              {t("price.more")}
            </Link>
          </div>
        </div>
      </section>

      {/* 4. What it doesn't do, as prose. */}
      <section
        id="honesto"
        aria-labelledby="hon-h"
        className={cn(section, "flex scroll-mt-6 flex-wrap gap-x-16 gap-y-8 pb-28")}
      >
        <div className="flex-[1_1_320px]">
          <h2
            id="hon-h"
            className={cn(
              h2,
              "text-[36px] leading-[38px] min-[900px]:text-5xl min-[900px]:leading-[50px]",
            )}
          >
            {t("honest.title")}
          </h2>
          <p className="mt-3.5 text-[17px] leading-[26px] text-muted">{t("honest.subtitle")}</p>
        </div>
        <ol className="flex flex-[2_1_560px] flex-col font-display text-xl leading-7 font-semibold tracking-[-0.01em] min-[900px]:text-2xl min-[900px]:leading-8">
          {limits.map((l) => (
            <li key={l} className="border-t border-border py-[22px] last:border-b">
              {l}
            </li>
          ))}
        </ol>
      </section>

      {/* 5. Close: mint into evening peach, the end of the day. */}
      <section aria-labelledby="fin-h" className={cn(section, "pb-16")}>
        <div className="flex flex-col items-center gap-5 rounded-[40px] bg-[linear-gradient(160deg,var(--wash-mint)_0%,var(--wash-mint-2)_40%,var(--wash-peach)_100%)] px-6 py-16 text-center min-[900px]:px-8 min-[900px]:py-[88px]">
          <h2
            id="fin-h"
            className={cn(
              h2,
              "max-w-[820px] text-[40px] leading-[42px] tracking-[-0.015em] min-[900px]:text-[72px] min-[900px]:leading-[70px]",
            )}
          >
            {t("final.title")}
          </h2>
          <p className="max-w-[560px] text-lg leading-[27px] text-muted">
            {t("final.body", { days: TRIAL_DAYS })}
          </p>
          <TrialCta label={cta} className="mt-2" />
        </div>
      </section>
    </div>
  );
}
