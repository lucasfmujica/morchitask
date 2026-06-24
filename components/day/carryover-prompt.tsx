"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, X } from "lucide-react";
import { taskKeys, useTasksForDate } from "@/lib/queries/tasks";
import { useMe } from "@/lib/queries/profiles";
import { rolloverIncomplete } from "@/lib/queries/daily-notes";
import { addDays } from "@/lib/date";

/**
 * "Che, no terminaste esto ayer — ¿lo sumás a hoy?" A gentle nudge at the top of
 * the Today view when yesterday left unfinished tasks. One tap pulls them all
 * into today (reuses the same rollover as the shutdown/plan rituals). Dismissable.
 */
export function CarryoverPrompt({ date }: { date: string }) {
  const qc = useQueryClient();
  const me = useMe().data;
  const yesterday = addDays(date, -1);
  const yesterdayQ = useTasksForDate(yesterday);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const pending = (yesterdayQ.data ?? []).filter(
    (t) => t.owner_id === me?.id && t.status === "todo",
  );
  if (dismissed || pending.length === 0) return null;

  async function bringToToday() {
    setBusy(true);
    try {
      await rolloverIncomplete(yesterday, date);
      qc.invalidateQueries({ queryKey: taskKeys.date(yesterday) });
      qc.invalidateQueries({ queryKey: taskKeys.date(date) });
      setDismissed(true);
    } finally {
      setBusy(false);
    }
  }

  const n = pending.length;
  return (
    <div className="flex items-center gap-3 rounded-card border border-accent/30 bg-accent-soft/60 p-3 shadow-soft">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">
          {n === 1
            ? "Che, ayer quedó 1 tarea sin terminar."
            : `Che, ayer quedaron ${n} tareas sin terminar.`}
        </p>
        <p className="text-xs text-muted">¿Las sumás a hoy?</p>
      </div>
      <button
        onClick={bringToToday}
        disabled={busy}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
        Sumar a hoy
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Ahora no"
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
