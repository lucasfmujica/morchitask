"use client";

import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import type { LaunchMetrics } from "@/lib/db/queries/admin-metrics";
import {
  ACTIVATION_MIN_DAYS,
  ACTIVATION_WINDOW_DAYS,
  PERIODS,
  stepConversion,
  type Period,
} from "@/lib/funnel";
import { formatUsd } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Vercel's deep link that resolves to "this team's project's Web Analytics".
 * Visits are not in our database and the app has no way to read Vercel's, so
 * the tile links out instead of showing a number it would have to invent.
 */
const VERCEL_ANALYTICS_URL =
  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fanalytics&title=Open+Web+Analytics";

const PERIOD_KEYS = {
  week: "periodWeek",
  launch: "periodLaunch",
  all: "periodAll",
} as const satisfies Record<Period, string>;

const well = "rounded-[28px] bg-surface-2 p-2";
const tile = "rounded-[22px] bg-surface p-[18px] shadow-tile";
const h2 = "font-display text-lg font-semibold text-fg";
const big = "font-display text-[36px] leading-[44px] font-bold tracking-[-0.02em] tabular-nums";

/** A calendar day as a Date that formats as that same day anywhere. */
const noon = (day: string) => new Date(`${day}T12:00:00Z`);

/**
 * `/admin/metrics`, presentational half. Everything arrives computed, for all
 * three periods, so switching period is local state and there is no endpoint
 * to call with a period of one's own choosing.
 */
export function LaunchMetricsView({ metrics }: { metrics: LaunchMetrics }) {
  const t = useTranslations("adminMetrics");
  const format = useFormatter();
  const locale = useLocale();
  const [period, setPeriod] = useState<Period>("launch");
  const f = metrics.funnel[period];
  const n = (v: number) => format.number(v);

  // Bars are relative to trials: visits are the real top of the funnel, but
  // they live in Vercel, so the widest bar the app can draw honestly is this.
  const steps = [
    { key: "stepTrials", value: f.trials, prev: null },
    { key: "stepActivated", value: f.activated, prev: f.trials },
    { key: "stepCheckout", value: f.checkout, prev: f.activated },
    { key: "stepPaid", value: f.paid, prev: f.checkout },
  ] as const;
  const width = (v: number) =>
    f.trials > 0 && v > 0 ? `${Math.max(4, Math.round((v / f.trials) * 100))}%` : "0%";

  const { cut, revenue } = metrics;
  const cutPct = Math.min(100, Math.round((cut.payments / cut.target) * 100));

  return (
    <div className="flex flex-col gap-4 pb-6 tabular-nums">
      <header className="flex animate-up flex-wrap items-end gap-4 px-2 pt-3">
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          <span className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
            {t("eyebrow")}
          </span>
          <h1 className="font-display text-[32px] leading-9 font-bold tracking-[-0.02em] text-fg">
            {t("title")}
          </h1>
        </div>
        <div className="-mx-1 max-w-full overflow-x-auto px-1">
          <div
            role="group"
            aria-label={t("periodLabel")}
            className="flex w-max gap-0.5 rounded-pill bg-surface-2 p-1"
          >
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={cn(
                  "h-9 cursor-pointer rounded-pill px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-200",
                  period === p ? "bg-surface text-fg shadow-pill" : "text-muted hover:text-fg",
                )}
              >
                {t(PERIOD_KEYS[p])}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section
        aria-labelledby="funnel-h"
        className={cn(well, "animate-up")}
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 pt-2.5 pb-2">
          <h2 id="funnel-h" className={h2}>
            {t("funnelTitle")}
          </h2>
          <span className="text-2xs text-muted">
            {t("activationRule", { days: ACTIVATION_MIN_DAYS, window: ACTIVATION_WINDOW_DAYS })}
          </span>
        </div>
        <ol className="grid grid-cols-2 gap-2 min-[900px]:grid-cols-5">
          <li className={cn(tile, "col-span-2 flex flex-col gap-2 min-[900px]:col-span-1")}>
            <span className="text-2xs text-muted">{t("stepVisits")}</span>
            <a
              href={VERCEL_ANALYTICS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-1 font-display text-lg leading-6 font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t("visitsLink")}
              <ArrowUpRight aria-hidden className="size-4 shrink-0" />
            </a>
            <div className="h-2 rounded-pill bg-surface-2" />
            <span className="text-2xs font-semibold text-muted">{t("visitsNote")}</span>
          </li>
          {steps.map((s) => {
            const pct = s.prev === null ? null : stepConversion(s.value, s.prev);
            return (
              <li key={s.key} className={cn(tile, "flex min-w-0 flex-col gap-2")}>
                <span className="text-2xs text-muted">{t(s.key)}</span>
                <span className={big}>{n(s.value)}</span>
                <div className="h-2 overflow-hidden rounded-pill bg-surface-2">
                  <div
                    className="h-full animate-fill rounded-pill bg-fit-bar"
                    style={{ width: width(s.value) }}
                  />
                </div>
                <span
                  className={cn(
                    "text-2xs font-semibold",
                    pct === null ? "text-muted" : "text-primary",
                  )}
                >
                  {s.prev === null
                    ? t("convBase")
                    : pct === null
                      ? t("convNone")
                      : t("convStep", { pct })}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex flex-wrap gap-4">
        <section
          aria-labelledby="revenue-h"
          className={cn(well, "flex-[1_1_360px] animate-up")}
          style={{ animationDelay: "140ms" }}
        >
          <div className="px-3 pt-2.5 pb-2">
            <h2 id="revenue-h" className={h2}>
              {t("revenueTitle")}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-w-0 flex-col gap-1 rounded-[22px] bg-ink p-[18px] text-on-ink">
              <span className="text-2xs text-on-ink/70">{t("mrr")}</span>
              <span className={big}>{formatUsd(revenue.mrrUsd, locale)}</span>
              <span className="text-2xs text-on-ink/70">
                {t("mrrSplit", { monthly: revenue.payingMonthly, yearly: revenue.payingYearly })}
              </span>
            </div>
            <div className={cn(tile, "flex min-w-0 flex-col gap-1")}>
              <span className="text-2xs text-muted">{t("churned")}</span>
              <span className={big}>{n(f.churned)}</span>
              <span className="text-2xs text-muted">
                {t("expiredUnpaid", { count: f.expiredUnpaid })}
              </span>
            </div>
          </div>
          <div className={cn(tile, "mt-2 flex flex-col gap-2.5")}>
            <div className="flex flex-wrap justify-between gap-x-3 text-sm">
              <span className="font-semibold">
                {t("cutTitle", {
                  date: format.dateTime(noon(cut.cutDay), {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    timeZone: "UTC",
                  }),
                })}
              </span>
              <span className="font-mono text-2xs text-muted">
                {t("cutDay", { day: cut.day, total: cut.totalDays })}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-pill bg-surface-2">
              <div
                className="h-full animate-fill rounded-pill bg-fit-bar"
                style={{ width: `${cutPct}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-primary">
              {t("cutPayments", { count: cut.payments, target: cut.target })}
            </span>
          </div>
        </section>

        <section
          aria-labelledby="cohorts-h"
          className={cn(well, "min-w-0 flex-[2_1_520px] animate-up")}
          style={{ animationDelay: "200ms" }}
        >
          <div className="px-3 pt-2.5 pb-2">
            <h2 id="cohorts-h" className={h2}>
              {t("cohortsTitle")}
            </h2>
          </div>
          <div className={cn(tile, "overflow-x-auto px-[18px] py-1.5")}>
            {f.weeks.length === 0 ? (
              <p className="py-3 text-sm text-muted">{t("cohortsEmpty")}</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11px] tracking-[0.06em] whitespace-nowrap text-muted uppercase">
                    <th className="py-3 pr-3 font-semibold">{t("colWeek")}</th>
                    <th className="pr-3 font-semibold">{t("colSignups")}</th>
                    <th className="pr-3 font-semibold">{t("colActivated")}</th>
                    <th className="pr-3 font-semibold">{t("colPaid")}</th>
                    <th className="font-semibold">{t("colRate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {f.weeks.map((w) => {
                    const rate = stepConversion(w.paid, w.signups) ?? 0;
                    return (
                      <tr key={w.weekStart} className="border-t border-surface-2">
                        <td className="py-3 pr-3 font-mono text-2xs">
                          {format.dateTime(noon(w.weekStart), {
                            day: "numeric",
                            month: "numeric",
                            timeZone: "UTC",
                          })}
                        </td>
                        <td className="pr-3">{n(w.signups)}</td>
                        <td className="pr-3">{n(w.activated)}</td>
                        <td className="pr-3">{n(w.paid)}</td>
                        <td
                          className={cn(
                            "font-semibold",
                            w.paid > 0 ? "text-primary" : "text-muted",
                          )}
                        >
                          {t("rate", { pct: rate })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <p className="px-2 text-2xs text-muted">{t("footnote")}</p>
    </div>
  );
}
