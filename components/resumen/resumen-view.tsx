"use client";

import { useQueries } from "@tanstack/react-query";
import { tasksForDateQueryOptions } from "@/lib/queries/tasks";
import { useChannels } from "@/lib/queries/channels";
import type { Task } from "@/lib/queries/types";
import { todayISO, weekRange, weekRangeLabel } from "@/lib/date";
import { formatMinutes } from "@/lib/format";

export function ResumenView() {
  const today = todayISO();
  const week = weekRange(today, 1);
  const results = useQueries({ queries: week.map((d) => tasksForDateQueryOptions(d)) });
  const channels = useChannels().data ?? [];

  const tasks = results.flatMap((r) => (r.data ?? []) as Task[]);
  const done = tasks.filter((t) => t.status === "done");
  const plannedMin = tasks.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0);
  const donePlannedMin = done.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0);

  const byChannel = new Map<string, number>();
  for (const t of tasks) {
    const k = t.channel_id ?? "none";
    byChannel.set(k, (byChannel.get(k) ?? 0) + (t.time_estimate_min ?? 0));
  }
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
  const maxMin = Math.max(1, ...channelRows.map((r) => r.min));

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">Resumen</h1>
        <p className="text-sm text-muted">Esta semana · {weekRangeLabel(week)}</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Completadas" value={`${done.length}`} sub={`de ${tasks.length} tareas`} />
        <Stat
          label="Tiempo planeado"
          value={plannedMin > 0 ? formatMinutes(plannedMin) : "—"}
          sub={donePlannedMin > 0 ? `${formatMinutes(donePlannedMin)} completado` : "esta semana"}
        />
      </div>

      <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-soft">
        <h2 className="font-semibold text-fg">Tiempo por categoría</h2>
        {channelRows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            Asigná tiempos y categorías a tus tareas para ver el desglose.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {channelRows.map((r) => (
              <div key={r.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-fg">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: r.color }}
                      aria-hidden
                    />
                    {r.name}
                  </span>
                  <span className="font-medium text-muted">{formatMinutes(r.min)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(r.min / maxMin) * 100}%`, backgroundColor: r.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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
