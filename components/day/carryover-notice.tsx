"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Undo2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { taskKeys } from "@/lib/queries/tasks";
import { useDateLabels } from "@/lib/use-date-labels";
import { sweepOverdueToToday, undoCarryover, type CarriedTask } from "@/lib/actions/carryover";

/**
 * Says what the automatic sweep just did, and offers to take it back.
 *
 * This replaced a prompt that asked first, and the change is the point: the
 * prompt only ever looked at *yesterday*, so on a Monday it looked at an empty
 * Sunday and said nothing while Friday's work sat on a date Today never
 * renders. Asking about the wrong day is worse than not asking.
 *
 * So the move happens on open and the question becomes "was that right?", which
 * is answerable — the tasks are on screen while it is being asked. Undo puts
 * each one back on its own day, and does not re-arm the sweep: it means "not
 * today", not "ask me again on the next page load".
 */
export function CarryoverNotice({ date }: { date: string }) {
  const t = useTranslations("day");
  const labels = useDateLabels();
  const qc = useQueryClient();
  const [moved, setMoved] = useState<CarriedTask[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [undoing, setUndoing] = useState(false);
  // React runs effects twice in development. The once-a-day claim on the server
  // already makes a second sweep return nothing, so this is only here to save
  // the round trip.
  const swept = useRef(false);

  useEffect(() => {
    if (swept.current) return;
    swept.current = true;

    let cancelled = false;
    sweepOverdueToToday(date)
      .then((tasks) => {
        if (cancelled || tasks.length === 0) return;
        setMoved(tasks);
        invalidate(qc);
      })
      // A failed sweep is not worth an error on screen: nothing moved, and the
      // days it would have pulled from are still reachable by their own dates.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [date, qc]);

  if (dismissed || moved.length === 0) return null;

  async function undo() {
    setUndoing(true);
    try {
      await undoCarryover(date, moved);
      invalidate(qc);
      setDismissed(true);
    } finally {
      setUndoing(false);
    }
  }

  // How far back it reached, so the notice can name the day when it all came
  // from one place. `shortDayLabel` on purpose: it always renders a weekday and
  // a number, never "yesterday" — the sentence around it is fixed text, and
  // "del ayer" is not Spanish.
  const days = new Set(moved.map((m) => m.from));
  const oldest = [...days].sort()[0];

  return (
    <div className="flex items-center gap-3 rounded-card border border-accent/30 bg-accent-soft/60 p-3 shadow-soft">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <ArrowDownToLine className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{t("carriedIn", { n: moved.length })}</p>
        <p className="text-xs text-muted">
          {days.size === 1
            ? t("carriedFromOne", { day: labels.shortDayLabel(oldest) })
            : t("carriedFromMany")}
        </p>
      </div>
      <button
        onClick={undo}
        disabled={undoing}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
      >
        <Undo2 className="h-4 w-4" aria-hidden />
        {t("carriedUndo")}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label={t("carriedDismiss")}
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Everything task-shaped, because a sweep changes today, the days the tasks
 *  came from, and the week and month views that summarise both. */
function invalidate(qc: ReturnType<typeof useQueryClient>): void {
  // `taskKeys.all` is a prefix of every per-day, backlog and range key, so this
  // one call covers today, each day a task left, and the week/month views that
  // would otherwise keep showing it where it used to be.
  qc.invalidateQueries({ queryKey: taskKeys.all });
}
