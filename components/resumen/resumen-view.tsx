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
import {
  addDays,
  addMonths,
  monthLabel,
  shortDayLabel,
  todayISO,
  weekRange,
  weekRangeLabel,
  type DayISO,
} from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

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
function buildPeriod(today: DayISO, period: Period): PeriodShape {
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
      if (inMonth.length) weeks.push({ key: ws, label: shortDayLabel(inMonth[0]), days: inMonth });
      ws = addDays(ws, 7);
    }
    return { label: monthLabel(today), start: first, end: last, days, weeks };
  }

  const thisWeekStart = weekRange(today, 1)[0];
  const count = period === "4weeks" ? 4 : 1;
  const weeks: PeriodWeek[] = [];
  const days = new Set<DayISO>();
  for (let i = 0; i < count; i++) {
    const ws = addDays(thisWeekStart, -7 * (count - 1 - i));
    const seven = Array.from({ length: 7 }, (_, j) => addDays(ws, j));
    seven.forEach((d) => days.add(d));
    weeks.push({ key: ws, label: shortDayLabel(ws), days: seven });
  }
  const start = weeks[0].days[0];
  const end = weeks[weeks.length - 1].days[6];
  const label = period === "4weeks" ? weekRangeLabel([start, end]) : weekRangeLabel(weeks[0].days);
  return { label, start, end, days, weeks };
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "Esta semana" },
  { value: "4weeks", label: "Últimas 4" },
  { value: "month", label: "Este mes" },
];

export function ResumenView() {
  const [period, setPeriod] = useState<Period>("week");
  const today = todayISO();
  const shape = useMemo(() => buildPeriod(today, period), [today, period]);

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
      name: "Sin categoría",
      color: "var(--color-subtle)",
      min: byChannel.get("none") ?? 0,
    },
  ]
    .filter((r) => r.min > 0)
    .sort((a, b) => b.min - a.min);
  const maxChannelMin = Math.max(1, ...channelRows.map((r) => r.min));

  const owners = ownerStats(tasks);
  const ownerRows = profiles
    .map((p) => ({ profile: p, stat: owners.get(p.id) }))
    .filter((r) => r.stat && r.stat.total > 0);

  const weekBars = shape.weeks.map((w) => {
    const c = completion(filterByDays(tasks, new Set(w.days)));
    return { key: w.key, label: w.label, ...c, rate: completionRate(c) };
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">Resumen</h1>
          <p className="text-sm text-muted">{shape.label}</p>
        </div>
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="flex w-max gap-1 rounded-pill border border-border bg-surface-2 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                aria-pressed={period === p.value}
                className={cn(
                  "cursor-pointer rounded-pill px-3 py-1 text-sm font-medium transition-colors",
                  period === p.value
                    ? "bg-surface text-fg shadow-soft"
                    : "text-muted hover:text-fg",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Completadas"
          value={`${overall.done}`}
          sub={`de ${overall.total} tareas · ${Math.round(completionRate(overall) * 100)}%`}
        />
        <Stat
          label="Tiempo planeado"
          value={plannedMin > 0 ? formatMinutes(plannedMin) : "—"}
          sub={
            accuracy.actualMin > 0 ? `${formatMinutes(accuracy.actualMin)} medido` : "en el período"
          }
        />
      </div>

      {weekBars.length > 1 && (
        <Section title="Completado por semana">
          <div className="flex items-end gap-2 sm:gap-3">
            {weekBars.map((w) => (
              <div key={w.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div className="flex h-28 w-full max-w-12 items-end overflow-hidden rounded-lg bg-surface-2">
                  <div
                    className="w-full rounded-lg bg-primary transition-[height]"
                    style={{ height: `${Math.max(w.rate * 100, w.done > 0 ? 6 : 0)}%` }}
                    title={`${w.done}/${w.total}`}
                  />
                </div>
                <span className="text-[11px] font-medium text-muted">
                  {Math.round(w.rate * 100)}%
                </span>
                <span className="truncate text-[11px] text-subtle">{w.label}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {accuracy.trackedCount > 0 && (
        <Section title="Estimado vs. real" hint={`${accuracy.trackedCount} con tiempo medido`}>
          <CompareBar
            label="Estimado"
            min={accuracy.estimatedMin}
            max={Math.max(accuracy.estimatedMin, accuracy.actualMin)}
            tone="bg-subtle"
          />
          <CompareBar
            label="Real"
            min={accuracy.actualMin}
            max={Math.max(accuracy.estimatedMin, accuracy.actualMin)}
            tone="bg-primary"
          />
        </Section>
      )}

      <Section title="Tiempo por categoría">
        {channelRows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            Asigná tiempos y categorías a tus tareas para ver el desglose.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {channelRows.map((r) => (
              <div key={r.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-fg">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color }}
                      aria-hidden
                    />
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span className="shrink-0 pl-2 font-medium text-muted">
                    {formatMinutes(r.min)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(r.min / maxChannelMin) * 100}%`, backgroundColor: r.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {ownerRows.length > 0 && (
        <Section title="Por persona">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ownerRows.map(({ profile, stat }) => (
              <div
                key={profile.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3"
              >
                <OwnerAvatar profile={profile} size={32} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{profile.display_name}</p>
                  <p className="text-xs text-muted">
                    {stat!.done}/{stat!.total} hechas · {formatMinutes(stat!.plannedMin)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-fg">{title}</h2>
        {hint && <span className="text-xs text-subtle">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function CompareBar({
  label,
  min,
  max,
  tone,
}: {
  label: string;
  min: number;
  max: number;
  tone: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-fg">{label}</span>
        <span className="font-medium text-muted">{formatMinutes(min)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full", tone)}
          style={{ width: `${max > 0 ? (min / max) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-fg">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}
