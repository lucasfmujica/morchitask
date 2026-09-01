import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, Moon, Sun } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatUsd, PRICE_MONTHLY_USD, TRIAL_DAYS } from "@/lib/pricing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing");
  return { title: "Morchitask", description: t("heroSubtitle") };
}

/**
 * The landing page.
 *
 * Written around one bet the plan makes explicitly: this is not competing on
 * features, it is competing on price and on doing less. So the page leads with
 * the ritual, then spends a whole section on what the app deliberately does NOT
 * do — teams, AI, offline. That section exists to lose the wrong visitors
 * before they pay, not after, because a refund and a bad review both cost more
 * than a bounce.
 */
export default async function LandingPage() {
  const t = await getTranslations("marketing");

  const steps = [
    { icon: Sun, title: t("ritualPlanTitle"), body: t("ritualPlanBody") },
    { icon: CalendarClock, title: t("ritualDayTitle"), body: t("ritualDayBody") },
    { icon: Moon, title: t("ritualCloseTitle"), body: t("ritualCloseBody") },
  ];

  const limits = [
    t("honestNoTeams"),
    t("honestNoAi"),
    t("honestNoOffline"),
    t("honestNoIntegrations"),
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(120% 80% at 50% -20%, var(--color-primary-soft), transparent 60%)",
          }}
          aria-hidden
        />
        <div className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:py-28">
          <h1 className="text-balance text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted">
            {t("heroSubtitle")}
          </p>
          <div className="mt-8 flex flex-col items-center gap-2">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-on-primary shadow-card transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            >
              {t("heroCta")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <p className="text-xs text-subtle">
              {t("heroCtaNote")}{" "}
              {t("priceLine", { price: formatUsd(PRICE_MONTHLY_USD), days: TRIAL_DAYS })}
            </p>
          </div>
        </div>
      </section>

      {/* The ritual */}
      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-20">
          <h2 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
            {t("ritualTitle")}
          </h2>
          <p className="mt-2 text-muted">{t("ritualSubtitle")}</p>

          {/* Numbered rather than a 3-up icon grid: the order is the product. */}
          <ol className="mt-10 flex flex-col gap-8">
            {steps.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="flex gap-4 sm:gap-6">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  {i < steps.length - 1 && <span className="w-px flex-1 bg-border" aria-hidden />}
                </div>
                <div className="min-w-0 pb-2">
                  <h3 className="text-lg font-bold tracking-tight text-fg">{title}</h3>
                  <p className="mt-1.5 max-w-2xl text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What it doesn't do */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-20">
          <h2 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
            {t("honestTitle")}
          </h2>
          <p className="mt-2 text-muted">{t("honestSubtitle")}</p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {limits.map((limit) => (
              <li
                key={limit}
                className="rounded-card border border-border bg-surface p-4 text-sm text-muted shadow-soft"
              >
                {limit}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Price */}
      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-20">
          <h2 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
            {t("compareTitle")}
          </h2>
          <p className="mt-3 text-balance text-muted">{t("compareBody")}</p>
          <Link
            href="/pricing"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:underline"
          >
            {t("navPricing")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-3xl px-5 py-20 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
            {t("finalTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-balance text-muted">{t("finalBody")}</p>
          <Link
            href="/login"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-on-primary shadow-card transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          >
            {t("heroCta")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
