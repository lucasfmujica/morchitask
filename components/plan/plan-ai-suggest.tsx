"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles, X } from "lucide-react";
import { suggestDayPlan } from "@/lib/actions/ai";
import type { BusyRange } from "@/lib/scheduling";
import { nextBlockDurationMin, showInUnscheduled } from "@/lib/scheduling";
import type { PlanProposal } from "@/lib/ai-proposals";
import { useCreateBlock } from "@/lib/queries/task-blocks";
import { syncBlockCalendar, useCalendarEvents } from "@/lib/queries/calendar";
import { useMe } from "@/lib/queries/profiles";
import { useToast } from "@/lib/stores/toast";
import { DEFAULT_TIMEZONE, blockInstant, minutesFromMidnight, todayISO } from "@/lib/date";
import {
  blockEndMin,
  blockStartMin,
  minutesToHHMM,
  useAgendaScheduling,
} from "@/components/day/use-agenda-scheduling";
import type { Task, TaskBlock } from "@/lib/queries/types";
import { Button } from "@/components/ui";

const TZ = DEFAULT_TIMEZONE;
/** Same defaults as the agenda: the day starts at 9 and the target end is 18:00. */
const DAY_START_MIN = 9 * 60;
const DEFAULT_END_MIN = 18 * 60;

/**
 * "Planificar con IA": Claude proposes an order and time-slots for the day's
 * loose work. You see the proposal first; "Aplicar" creates the blocks, and
 * the toast's "Deshacer" removes exactly the ones it created.
 */
export function PlanAiSuggest({
  date,
  tasks,
  blocksByTask,
  capacityLeftMin,
  endTargetMin,
}: {
  date: string;
  tasks: Task[];
  blocksByTask: Map<string, TaskBlock[]>;
  capacityLeftMin: number;
  endTargetMin: number | null | undefined;
}) {
  const t = useTranslations("ai");
  const tt = useTranslations("tasks");
  const me = useMe().data;
  const connected = !!me?.google_calendar_connected;
  const calendarQ = useCalendarEvents(date, connected);
  const create = useCreateBlock(date);
  const { removeBlock } = useAgendaScheduling(date);
  const toast = useToast();

  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  // Work that still needs a place in the day, with how much of it is left.
  const pending = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "todo")
        .filter((t) => showInUnscheduled(t.time_estimate_min, blocksByTask.get(t.id) ?? []))
        .map((t) => ({
          task: t,
          remainingMin: nextBlockDurationMin(t.time_estimate_min, blocksByTask.get(t.id) ?? []),
        })),
    [tasks, blocksByTask],
  );

  // Everything already occupying the day: your blocks plus calendar events
  // (minus the ones that are mirrors of your own blocks).
  const busy = useMemo(() => {
    const ranges: BusyRange[] = [];
    const ownEventIds = new Set<string>();
    for (const t of tasks) {
      for (const b of blocksByTask.get(t.id) ?? []) {
        ranges.push({ startMin: blockStartMin(b), endMin: blockEndMin(b) });
        if (b.gcal_event_id) ownEventIds.add(b.gcal_event_id);
      }
    }
    for (const e of calendarQ.data ?? []) {
      if (e.allDay || !e.start || ownEventIds.has(e.id)) continue;
      const startMin = minutesFromMidnight(e.start, TZ);
      ranges.push({ startMin, endMin: e.end ? minutesFromMidnight(e.end, TZ) : startMin + 30 });
    }
    return ranges.filter((r) => r.endMin > r.startMin);
  }, [tasks, blocksByTask, calendarQ.data]);

  const titleById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);

  if (date < todayISO() || pending.length === 0) return null;

  async function ask() {
    const toMin = endTargetMin ?? DEFAULT_END_MIN;
    const nowMin =
      date === todayISO()
        ? Math.ceil(minutesFromMidnight(new Date().toISOString(), TZ) / 15) * 15
        : 0;
    const fromMin = Math.max(DAY_START_MIN, nowMin);
    if (fromMin >= toMin) {
      setError(`Ya no queda lugar antes de las ${minutesToHHMM(toMin)}.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await suggestDayPlan({
        date,
        tasks: pending.slice(0, 40).map((p) => ({
          id: p.task.id,
          title: p.task.title.slice(0, 200),
          remainingMin: p.remainingMin,
        })),
        busy: busy.slice(0, 100),
        fromMin,
        toMin,
        capacityLeftMin: Math.max(0, Math.round(capacityLeftMin)),
      });
      if (!res.ok) setError(t(`errors.${res.error}`));
      else if (res.data.blocks.length === 0) setError(t("planNoRoom"));
      else setProposal(res.data);
    } catch {
      setError(t("errors.api"));
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!proposal) return;
    setApplying(true);
    const created: TaskBlock[] = [];
    try {
      for (const b of proposal.blocks) {
        const block = await create.mutateAsync({
          taskId: b.taskId,
          startISO: blockInstant(date, minutesToHHMM(b.startMin), TZ),
          endISO: blockInstant(date, minutesToHHMM(b.endMin), TZ),
        });
        created.push(block);
        if (connected) syncBlockCalendar({ action: "upsert", blockId: block.id }).catch(() => {});
      }
      setProposal(null);
      toast(t("planApplied", { n: created.length }), {
        label: tt("undo"),
        run: () => created.forEach(removeBlock),
      });
    } catch {
      setError(created.length ? t("planPartial", { n: created.length }) : t("planFailed"));
      setProposal(null);
    } finally {
      setApplying(false);
    }
  }

  if (!proposal) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-bold text-fg">{t("planTitle")}</h2>
            <p className="mt-0.5 text-xs text-muted">{t("planHint", { n: pending.length })}</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={ask}
          disabled={loading}
          className="mt-3 w-full"
          size="sm"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
          {loading ? t("planLoading") : t("planAsk")}
        </Button>
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-accent/40 bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden />
        <h2 className="flex-1 text-xs font-bold text-fg">{t("proposal")}</h2>
        <button
          onClick={() => setProposal(null)}
          aria-label={t("dismiss")}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {proposal.note && <p className="mt-1.5 text-xs text-muted">{proposal.note}</p>}
      <ol className="mt-3 flex flex-col gap-1.5">
        {proposal.blocks.map((b) => (
          <li key={b.taskId} className="flex items-baseline gap-2.5 text-xs">
            <span className="shrink-0 font-semibold tabular-nums text-accent">
              {minutesToHHMM(b.startMin)}–{minutesToHHMM(b.endMin)}
            </span>
            <span className="min-w-0 flex-1 truncate text-fg">{titleById.get(b.taskId)}</span>
          </li>
        ))}
      </ol>
      {proposal.skippedTaskIds.length > 0 && (
        <p className="mt-2 text-2xs text-subtle">
          {t("planSkipped", { n: proposal.skippedTaskIds.length })}
        </p>
      )}
      <Button onClick={apply} disabled={applying} className="mt-3 w-full" size="sm">
        {applying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {t("planApply")}
      </Button>
    </section>
  );
}
