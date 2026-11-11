"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
      <header className="flex flex-wrap items-end gap-x-3 gap-y-3 px-2 pt-1">
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          <span className="text-2xs font-semibold tracking-[0.06em] text-muted uppercase">
            {shape.label}
          </span>
          <h1 className="font-display text-[32px] leading-9 font-bold tracking-tight text-fg">
            {t("title")}
          </h1>
        </div>
        <div className="-mx-1 max-w-full overflow-x-auto px-1">
          <div className="flex w-max gap-0.5 rounded-pill bg-surface-2 p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                aria-pressed={period === p.value}
                className={cn(
                  "h-9 cursor-pointer rounded-pill px-4 text-sm font-semibold transition-colors",
                  period === p.value
                    ? "bg-surface text-fg shadow-soft"
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
        {/* The hero tile: completion is the number this screen exists for. */}
        <section className="flex items-center gap-[18px] rounded-2xl bg-fg p-[22px] text-bg">
          <Ring pct={overallPct} />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs text-bg/60">{t("statDone")}</p>
            <p className="font-display text-[40px] leading-none font-bold tracking-tight tabular-nums">
              {overall.done}
            </p>
            <p className="text-xs text-bg/80">
              {t("statDoneSub", { total: overall.total, pct: overallPct })}
            </p>
          </div>
        </section>
        <Well className="flex flex-col justify-center gap-1 p-[22px]">
          <p className="text-xs text-muted">{t("statPlanned")}</p>
          <p className="font-display text-[40px] leading-none font-bold tracking-tight text-fg tabular-nums">
            {plannedMin > 0 ? formatMinutes(plannedMin) : "—"}
          </p>
          <p className="text-xs text-muted">
            {accuracy.actualMin > 0
              ? t("statPlannedMeasured", { time: formatMinutes(accuracy.actualMin) })
              : t("statPlannedSub")}
          </p>
        </Well>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
        <ChartCard title={period === "week" ? t("byDay") : t("byWeek")}>
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
                    "w-full rounded-xl transition-[height] duration-500",
                    b.key === bestKey ? "bg-fit" : "bg-surface-2",
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
            legend={
              <>
                <LegendSwatch className="bg-border-strong" label={t("estimatedBar")} />
                <LegendSwatch className="bg-fit" label={t("actualBar")} />
              </>
            }
          >
            <div className="flex flex-col gap-3">
              {accuracyRows.map((r) => (
                <div key={r.id} className="flex flex-col gap-[5px]">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-semibold text-fg">{r.name}</span>
                    <span className="shrink-0 font-mono text-muted tabular-nums">
                      {t("evrValue", {
                        estimated: formatMinutes(r.estimatedMin),
                        actual: formatMinutes(r.actualMin),
                      })}
                    </span>
                  </div>
                  <Meter value={r.estimatedMin} max={maxAccuracyMin} tone="bg-border-strong" />
                  <Meter value={r.actualMin} max={maxAccuracyMin} tone="bg-fit" />
                </div>
              ))}
            </div>
            <span className="mt-auto text-[11px] text-muted">
              {t("trackedCount", { n: accuracy.trackedCount })}
            </span>
          </ChartCard>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
        <Well className="flex flex-col gap-3 p-[18px]">
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
                    className="block h-full min-w-1 rounded-pill transition-[flex-grow] duration-500"
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
                  <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                    {formatMinutes(r.min)}
                  </span>
                </div>
              ))}
            </>
          )}
        </Well>

        {ownerRows.length > 0 && (
          <Well className="flex flex-col gap-3.5 p-[18px]">
            <h2 className="text-base font-semibold text-fg">{t("byPerson")}</h2>
            {ownerRows.map(({ profile, stat }) => (
              <div
                key={profile.id}
                className="flex items-center gap-3 rounded-xl bg-surface px-3.5 py-3 shadow-soft"
              >
                <OwnerAvatar profile={profile} size={34} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 text-[13px]">
                    <p className="truncate font-semibold text-fg">{profile.display_name}</p>
                    <p className="text-xs text-muted">
                      {t("personStats", {
                        done: stat!.done,
                        total: stat!.total,
                        time: formatMinutes(stat!.plannedMin),
                      })}
                    </p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-pill bg-surface-2" aria-hidden>
                    <div
                      className="h-full rounded-pill bg-fit transition-[width] duration-500"
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

/** Completion as a ring on the dark hero tile. The track is a tint of the
 *  card's own ink so it flips with the tile in dark mode; the arc is the same
 *  "fit" ramp as `bg-fit`, which SVG strokes can't take as a class. */
function Ring({ pct }: { pct: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative h-[104px] w-[104px] shrink-0">
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="resumen-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-fit-from)" />
            <stop offset="1" stopColor="var(--color-primary)" />
          </linearGradient>
        </defs>
        <circle
          cx="66"
          cy="66"
          r={R}
          fill="none"
          stroke="var(--color-bg)"
          strokeOpacity={0.12}
          strokeWidth="13"
        />
        <circle
          cx="66"
          cy="66"
          r={R}
          fill="none"
          stroke="url(#resumen-ring)"
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.min(pct, 100) / 100)}
          style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
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
  children,
}: {
  title: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Well>
      <section className="flex h-full flex-col gap-3.5 rounded-xl bg-surface p-[18px] shadow-soft">
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
        className={cn("h-full rounded-pill transition-[width] duration-500", tone)}
        style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
      />
    </div>
  );
}
