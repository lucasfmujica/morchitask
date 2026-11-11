"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { tasksInRangeQueryOptions } from "@/lib/queries/tasks";
import { useChannels } from "@/lib/queries/channels";
import { useProfiles } from "@/lib/queries/profiles";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";
import {
  completion,
  completionRate,
  estimatedVsActual,
  filterByDays,
  minutesByChannel,
  ownerStats,
} from "@/lib/analytics";
import { addDays, addMonths, todayISO, weekRange, type DayISO } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Well } from "@/components/ui";
import type { DateLabels } from "@/lib/date-labels";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

type Period = "week" | "4weeks" | "month";

type PeriodWeek = { key: string; label: string; days: DayISO[] };
type PeriodShape = {
  label: string;
  start: DayISO;
  end: DayISO;
  days: Set<DayISO>;
  weeks: PeriodWeek[];
};

/** The days + week buckets covered by a period, anchored on `today`. */
/** Takes `labels` rather than reaching for the hook: this sits outside the
 *  component, where hooks cannot run. */
function buildPeriod(today: DayISO, period: Period, labels: DateLabels): PeriodShape {
  if (period === "month") {
    const first = `${today.slice(0, 7)}-01`;
    const last = addDays(addMonths(first, 1), -1);
    const days = new Set<DayISO>();
    for (let d = first; d <= last; d = addDays(d, 1)) days.add(d);

    const weeks: PeriodWeek[] = [];
    let ws = weekRange(first, 1)[0];
    while (ws <= last) {
      const seven = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
      const inMonth = seven.filter((d) => days.has(d));
      if (inMonth.length)
        weeks.push({ key: ws, label: labels.shortDayLabel(inMonth[0]), days: inMonth });
      ws = addDays(ws, 7);
    }
    return { label: labels.monthLabel(today), start: first, end: last, days, weeks };
  }

  const thisWeekStart = weekRange(today, 1)[0];
  const count = period === "4weeks" ? 4 : 1;
  const weeks: PeriodWeek[] = [];
  const days = new Set<DayISO>();
  for (let i = 0; i < count; i++) {
    const ws = addDays(thisWeekStart, -7 * (count - 1 - i));
    const seven = Array.from({ length: 7 }, (_, j) => addDays(ws, j));
    seven.forEach((d) => days.add(d));
    weeks.push({ key: ws, label: labels.shortDayLabel(ws), days: seven });
  }
  const start = weeks[0].days[0];
  const end = weeks[weeks.length - 1].days[6];
  const label =
    period === "4weeks"
      ? labels.weekRangeLabel([start, end])
      : labels.weekRangeLabel(weeks[0].days);
  return { label, start, end, days, weeks };
}

const PERIODS: { value: Period; labelKey: string }[] = [
  { value: "week", labelKey: "periodWeek" },
  { value: "4weeks", labelKey: "period4Weeks" },
  { value: "month", labelKey: "periodMonth" },
];

export function ResumenView() {
  const labels = useDateLabels();
  const t = useTranslations("summary");
  const [period, setPeriod] = useState<Period>("week");
  const today = todayISO();
  const shape = useMemo(() => buildPeriod(today, period, labels), [today, period, labels]);

  const channels = useChannels().data ?? [];
  const profiles = useProfiles().data ?? [];
  const tasksQ = useQuery(tasksInRangeQueryOptions(shape.start, shape.end));
  const tasks = useMemo(
    () => filterByDays(tasksQ.data ?? [], shape.days),
    [tasksQ.data, shape.days],
  );

  const overall = completion(tasks);
  const plannedMin = tasks.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0);
  const accuracy = estimatedVsActual(tasks);

  const byChannel = minutesByChannel(tasks);
  const channelRows = [
    ...channels.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      min: byChannel.get(c.id) ?? 0,
    })),
    {
      id: "none",
      name: t("noCategory"),
      color: "var(--color-subtle)",
      min: byChannel.get("none") ?? 0,
    },
  ]
    .filter((r) => r.min > 0)
    .sort((a, b) => b.min - a.min);
  // Estimated vs actual, split by category. Same rule as the totals: only
  // tasks with tracked time count, or an untracked task would read as a miss.
  const accuracyRows = channelRows
    .map((r) => ({
      ...r,
      ...estimatedVsActual(tasks.filter((task) => (task.channel_id ?? "none") === r.id)),
    }))
    .filter((r) => r.trackedCount > 0);
  const maxAccuracyMin = Math.max(
    1,
    ...accuracyRows.map((r) => Math.max(r.estimatedMin, r.actualMin)),
  );

  const owners = ownerStats(tasks);
  const ownerRows = profiles
    .map((p) => ({ profile: p, stat: owners.get(p.id) }))
    .filter((r) => r.stat && r.stat.total > 0);

  // A single week is charted day by day: one bar for the whole week said
  // nothing, which is why the chart used to hide itself on this period.
  const weekdayNames = labels.weekdayHeaders();
  const buckets =
    period === "week"
      ? shape.weeks[0].days.map((d, i) => ({ key: d, label: weekdayNames[i], days: [d] }))
      : shape.weeks;
  const bars = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    ...completion(filterByDays(tasks, new Set(b.days))),
  }));
  const maxDone = Math.max(0, ...bars.map((b) => b.done));
  // The best bucket gets the "fit" fill; ties go to the first. Nothing is
  // crowned when not a single task was done.
  const bestKey = maxDone > 0 ? bars.find((b) => b.done === maxDone)?.key : undefined;

  const overallPct = Math.round(completionRate(overall) * 100);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex animate-up flex-wrap items-center gap-2.5 px-2 pt-3">
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          <h1 className="font-display text-[32px] leading-9 font-bold tracking-[-0.02em] text-fg">
            {t("title")}
          </h1>
          {/* Not on the canvas, whose toggle names the period. "Últimas 4"
              doesn't say which four weeks, so the dates stay, as the quiet
              subtitle every other screen's header has. */}
          <p className="text-sm text-muted">{shape.label}</p>
        </div>
        <div className="-mx-1 max-w-full overflow-x-auto px-1">
          <div className="flex w-max gap-0.5 rounded-pill bg-surface-2 p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                aria-pressed={period === p.value}
                className={cn(
                  "h-9 cursor-pointer rounded-pill px-4 text-sm font-semibold transition-colors duration-200",
                  period === p.value
                    ? "bg-surface text-fg shadow-[0_1px_3px_rgb(var(--shadow-color)/calc(0.12*var(--shadow-strength)))]"
                    : "text-muted hover:text-fg",
                )}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {/* The hero tile: completion is the number this screen exists for.
            The canvas's #A9AFA2 / #CDD2C6 labels are the tile's ink at 65% and
            80%, so they flip with it in dark mode. */}
        <section
          className="flex animate-up items-center gap-[18px] rounded-[28px] bg-fg p-[22px] text-bg"
          style={{ animationDelay: "60ms" }}
        >
          <Ring pct={overallPct} />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-2xs text-bg/65">{t("statDone")}</p>
            <p className="font-display text-[40px] leading-none font-bold tracking-[-0.02em] tabular-nums">
              {overall.done}
            </p>
            <p className="text-2xs text-bg/80">
              {t("statDoneSub", { total: overall.total, pct: overallPct })}
            </p>
          </div>
        </section>
        <Well
          className="flex animate-up flex-col justify-center gap-1 rounded-[28px] p-[22px]"
          style={{ animationDelay: "120ms" }}
        >
          <p className="text-2xs text-muted">{t("statPlanned")}</p>
          <p className="font-display text-[40px] leading-none font-bold tracking-[-0.02em] text-fg tabular-nums">
            {plannedMin > 0 ? formatMinutes(plannedMin) : "—"}
          </p>
          <p className="text-2xs text-muted">
            {accuracy.actualMin > 0
              ? t("statPlannedMeasured", { time: formatMinutes(accuracy.actualMin) })
              : t("statPlannedSub")}
          </p>
        </Well>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
        <ChartCard title={period === "week" ? t("byDay") : t("byWeek")} delay={180}>
          <div className="flex h-[180px] items-end gap-2 sm:gap-3">
            {bars.map((b) => (
              <div
                key={b.key}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                title={`${b.done}/${b.total}`}
              >
                <span className="font-mono text-[11px] text-muted tabular-nums">{b.done}</span>
                <span
                  className={cn(
                    "w-full rounded-[12px] transition-[height] duration-[600ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]",
                    // Top-down on a bar, as the canvas draws it (180deg), not
                    // the diagonal of bg-fit.
                    b.key === bestKey ? "bg-linear-to-b from-fit-from to-primary" : "bg-surface-2",
                  )}
                  style={{ height: `${Math.max(4, maxDone > 0 ? (b.done / maxDone) * 100 : 0)}%` }}
                />
                <span className="max-w-full truncate text-[11px] font-semibold text-muted">
                  {b.label}
                </span>
              </div>
            ))}
          </div>
        </ChartCard>

        {accuracy.trackedCount > 0 && (
          <ChartCard
            title={t("estimateVsActual")}
            delay={220}
            gap="gap-3"
            legend={
              <>
                <LegendSwatch className="bg-border-strong" label={t("estimatedBar")} />
                <LegendSwatch className={FIT_MID} label={t("actualBar")} />
              </>
            }
          >
            {accuracyRows.map((r) => (
              <div key={r.id} className="flex flex-col gap-[5px]">
                <div className="flex items-baseline justify-between gap-2 text-2xs">
                  <span className="truncate font-semibold text-fg">{r.name}</span>
                  <span className="shrink-0 font-mono text-muted tabular-nums">
                    {t("evrValue", {
                      estimated: formatMinutes(r.estimatedMin),
                      actual: formatMinutes(r.actualMin),
                    })}
                  </span>
                </div>
                <Meter value={r.estimatedMin} max={maxAccuracyMin} tone="bg-border-strong" />
                <Meter value={r.actualMin} max={maxAccuracyMin} tone={FIT_BAR} />
              </div>
            ))}
            <span className="mt-auto text-[11px] text-muted">
              {t("trackedCount", { n: accuracy.trackedCount })}
            </span>
          </ChartCard>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
        <Well
          className="flex animate-up flex-col gap-3 rounded-[28px] p-[18px]"
          style={{ animationDelay: "260ms" }}
        >
          <h2 className="text-base font-semibold text-fg">{t("byCategory")}</h2>
          {channelRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">{t("byCategoryEmpty")}</p>
          ) : (
            <>
              {/* One stacked bar: the split is the point, and parallel bars made
                  you compare lengths across rows to see it. */}
              <div className="flex h-4 gap-[3px]" aria-hidden>
                {channelRows.map((r) => (
                  <span
                    key={r.id}
                    className="block h-full min-w-1 rounded-pill transition-[flex-grow] duration-[600ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                    style={{ flexGrow: r.min, backgroundColor: r.color }}
                  />
                ))}
              </div>
              {channelRows.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-[13px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: r.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold text-fg">{r.name}</span>
                  <span className="shrink-0 font-mono text-2xs text-muted tabular-nums">
                    {formatMinutes(r.min)}
                  </span>
                </div>
              ))}
            </>
          )}
        </Well>

        {ownerRows.length > 0 && (
          <Well
            className="flex animate-up flex-col gap-3.5 rounded-[28px] p-[18px]"
            style={{ animationDelay: "300ms" }}
          >
            <h2 className="text-base font-semibold text-fg">{t("byPerson")}</h2>
            {ownerRows.map(({ profile, stat }) => (
              <div
                key={profile.id}
                className="flex items-center gap-3 rounded-[18px] bg-surface px-3.5 py-3"
              >
                <OwnerAvatar profile={profile} size={34} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 text-[13px]">
                    <p className="truncate font-semibold text-fg">{profile.display_name}</p>
                    <p className="text-2xs text-muted">
                      {t("personStats", {
                        done: stat!.done,
                        total: stat!.total,
                        time: formatMinutes(stat!.plannedMin),
                      })}
                    </p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-pill bg-surface-2" aria-hidden>
                    <div
                      className={cn(
                        "h-full rounded-pill transition-[width] duration-[600ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]",
                        FIT_BAR,
                      )}
                      style={{ width: `${(stat!.done / stat!.total) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </Well>
        )}
      </div>
    </div>
  );
}

/** The fit ramp laid along a bar (the canvas's 90deg), not bg-fit's diagonal,
 *  which on an 8px-tall bar read as a flat colour. */
const FIT_BAR = "bg-linear-to-r from-fit-from to-primary";
/** Canvas #3FA266, a step between the mint and the primary green. No token
 *  holds it yet, so it is mixed from the two that do. */
const FIT_MID = "bg-[color-mix(in_srgb,var(--primary)_72%,var(--fit-from))]";

/** Completion as a ring on the dark hero tile. The track is a tint of the
 *  card's own ink so it flips with the tile in dark mode; the arc runs the
 *  canvas's lighter ramp (#B6EBC4 → #3FA266), mixed from the fit tokens so it
 *  follows the theme. It draws itself in from empty on mount (the canvas's
 *  `ring` keyframe: 1.3s, 0.3s in); MotionConfig skips that under reduced
 *  motion. */
function Ring({ pct }: { pct: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative h-[104px] w-[104px] shrink-0">
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="resumen-ring" x1="0" y1="0" x2="1" y2="1">
            {/* As style, not the stop-color attribute: an attribute won't take
                color-mix(), and the arc rendered as nothing. */}
            <stop
              offset="0"
              style={{ stopColor: "color-mix(in srgb, var(--color-fit-from) 62%, white)" }}
            />
            <stop
              offset="1"
              style={{
                stopColor: "color-mix(in srgb, var(--color-primary) 72%, var(--color-fit-from))",
              }}
            />
          </linearGradient>
        </defs>
        <circle
          cx="66"
          cy="66"
          r={R}
          fill="none"
          stroke="var(--color-bg)"
          strokeOpacity={0.08}
          strokeWidth="13"
        />
        <motion.circle
          cx="66"
          cy="66"
          r={R}
          fill="none"
          stroke="url(#resumen-ring)"
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - Math.min(pct, 100) / 100) }}
          transition={{ duration: 1.3, delay: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display text-[22px] font-bold">
        {pct}%
      </span>
    </div>
  );
}

/** A well holding one white card: the bento unit for a titled chart. */
function ChartCard({
  title,
  legend,
  delay,
  gap = "gap-3.5",
  children,
}: {
  title: string;
  legend?: React.ReactNode;
  /** Entrance stagger in ms, so the cards land one after another. */
  delay: number;
  gap?: string;
  children: React.ReactNode;
}) {
  return (
    <Well className="animate-up rounded-[28px]" style={{ animationDelay: `${delay}ms` }}>
      <section className={cn("flex h-full flex-col rounded-[22px] bg-surface p-[18px]", gap)}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="mr-auto text-base font-semibold text-fg">{title}</h2>
          {legend}
        </div>
        {children}
      </section>
    </Well>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted">
      <span className={cn("h-2 w-2 rounded-[2px]", className)} aria-hidden />
      {label}
    </span>
  );
}

function Meter({ value, max, tone }: { value: number; max: number; tone: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-pill bg-bg" aria-hidden>
      <div
        className={cn(
          "h-full rounded-pill transition-[width] duration-[600ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          tone,
        )}
        style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
      />
    </div>
  );
}
