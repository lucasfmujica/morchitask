"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, RotateCcw } from "lucide-react";
import type { Task, TaskBlock } from "@/lib/queries/types";
import { useMoveTaskToDate } from "@/lib/queries/tasks";
import { useToast } from "@/lib/stores/toast";
import { addDays } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import { orderForAppend } from "@/lib/ordering";
import { MIN_SCHEDULABLE_MIN, remainingMin, type BusyRange } from "@/lib/scheduling";
import { isNoop, replanFromNow, roundUpTo, type ReplanItem } from "@/lib/replan";
import { cn } from "@/lib/utils";
import { blockEndMin, blockStartMin, minutesToHHMM } from "./use-agenda-scheduling";

type Destination = "tomorrow" | "backlog" | "keep";

/**
 * "Se me rompió el día". One button in the agenda's toolbar that re-packs what
 * is left of today from now on, around calendar events and finished work.
 *
 * Nothing is written until "Aplicar": the panel shows what moves where and what
 * no longer fits, because a planner that silently rearranges your afternoon is
 * worse than one that lets it fall apart. The packing itself is `lib/replan.ts`.
 */
export function ReplanPanel({
  date,
  tasks,
  blocksByTask,
  calendarBusy,
  nowMin,
  endMin,
  meId,
  moveBlock,
  scheduleNewBlock,
}: {
  date: string;
  tasks: Task[];
  blocksByTask: Map<string, TaskBlock[]>;
  calendarBusy: BusyRange[];
  nowMin: number;
  endMin: number;
  meId: string | undefined;
  moveBlock: (block: TaskBlock, startMin: number) => void;
  scheduleNewBlock: (task: Task, startMin: number, durMin: number) => void;
}) {
  const td = useTranslations("day");
  const move = useMoveTaskToDate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [dest, setDest] = useState<Record<string, Destination>>({});

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const { items, fixed, blocksById, lateCount } = useMemo(() => {
    const items: ReplanItem[] = [];
    const fixed: BusyRange[] = [...calendarBusy];
    const blocksById = new Map<string, TaskBlock>();
    let lateCount = 0;
    for (const task of tasks) {
      const blocks = blocksByTask.get(task.id) ?? [];
      const movable = task.owner_id === meId && task.status === "todo";
      for (const block of blocks) {
        const startMin = blockStartMin(block);
        if (!movable) {
          fixed.push({ startMin, endMin: blockEndMin(block) });
          continue;
        }
        blocksById.set(block.id, block);
        if (startMin < nowMin) lateCount++;
        items.push({
          taskId: task.id,
          blockId: block.id,
          durMin: blockEndMin(block) - startMin,
          fromStartMin: startMin,
          priority: task.priority,
          sortOrder: task.sort_order,
        });
      }
      if (!movable) continue;
      // Time the estimate still asks for that no block covers yet.
      const rem = remainingMin(task.time_estimate_min, blocks);
      if (rem != null && rem >= MIN_SCHEDULABLE_MIN) {
        items.push({
          taskId: task.id,
          blockId: null,
          durMin: rem,
          fromStartMin: null,
          priority: task.priority,
          sortOrder: task.sort_order,
        });
      }
    }
    return { items, fixed, blocksById, lateCount };
  }, [tasks, blocksByTask, calendarBusy, meId, nowMin]);

  const plan = useMemo(
    () => replanFromNow({ items, fixed, fromMin: roundUpTo(nowMin), toMin: endMin }),
    [items, fixed, nowMin, endMin],
  );

  // A task whose pieces partly landed keeps the rest as unscheduled time; only
  // tasks with nothing placed get a destination choice.
  const placedTasks = new Set(plan.moves.map((m) => m.taskId));
  const strandedTasks = [
    ...new Set(plan.overflow.filter((o) => !placedTasks.has(o.taskId)).map((o) => o.taskId)),
  ];
  const changes = plan.moves.filter((m) => !isNoop(m));

  if (items.length === 0) return null;

  function apply() {
    for (const m of changes) {
      const task = tasksById.get(m.taskId);
      if (!task) continue;
      const block = m.blockId ? blocksById.get(m.blockId) : undefined;
      if (block) moveBlock(block, m.startMin);
      else scheduleNewBlock(task, m.startMin, m.durMin);
    }
    let parked = 0;
    for (const taskId of strandedTasks) {
      const task = tasksById.get(taskId);
      const choice = dest[taskId] ?? "tomorrow";
      if (!task || choice === "keep") continue;
      move.mutate({
        task,
        toDate: choice === "tomorrow" ? addDays(date, 1) : null,
        sortOrder: orderForAppend([]),
      });
      parked++;
    }
    setOpen(false);
    toast(td("replanDone", { moved: changes.length, parked }));
  }

  const over = plan.neededMin > plan.freeMin;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 self-start rounded-pill px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
          lateCount > 0
            ? "bg-accent-soft text-accent hover:bg-accent hover:text-on-accent"
            : "bg-surface-2 text-fg hover:bg-border",
        )}
      >
        <RotateCcw className="h-4 w-4" aria-hidden />
        {td("replanButton")}
        {lateCount > 0 && (
          <span className="text-2xs font-medium">· {td("replanLate", { n: lateCount })}</span>
        )}
      </button>

      {open && (
        <section
          aria-label={td("replanTitle")}
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3 shadow-soft"
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col rounded-xl bg-surface-2 px-3 py-2">
              <span className="text-2xs text-muted">{td("replanFree")}</span>
              <span className="text-lg font-bold tabular-nums">{formatMinutes(plan.freeMin)}</span>
            </div>
            <div
              className={cn(
                "flex flex-col rounded-xl px-3 py-2",
                over ? "bg-accent-soft" : "bg-primary-soft",
              )}
            >
              <span className="text-2xs text-muted">{td("replanNeeded")}</span>
              <span className="text-lg font-bold tabular-nums">
                {formatMinutes(plan.neededMin)}
              </span>
            </div>
          </div>
          <p className={cn("text-xs font-semibold", over ? "text-accent" : "text-success")}>
            {over
              ? td("replanOver", { time: formatMinutes(plan.neededMin - plan.freeMin) })
              : td("replanFits", { time: formatMinutes(plan.freeMin - plan.neededMin) })}
          </p>

          {changes.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {changes.map((m) => (
                <li
                  key={`${m.taskId}-${m.blockId ?? "loose"}`}
                  className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {tasksById.get(m.taskId)?.title}
                  </span>
                  <span className="text-2xs text-subtle tabular-nums line-through">
                    {m.fromStartMin == null ? td("replanLoose") : minutesToHHMM(m.fromStartMin)}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
                  <span className="rounded-pill bg-primary-soft px-2 py-0.5 text-2xs font-semibold tabular-nums">
                    {minutesToHHMM(m.startMin)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{td("replanNothing")}</p>
          )}

          {strandedTasks.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl bg-accent-soft p-3">
              <p className="text-xs font-semibold">{td("replanNoRoom")}</p>
              {strandedTasks.map((taskId) => {
                const choice = dest[taskId] ?? "tomorrow";
                const title = tasksById.get(taskId)?.title ?? "";
                return (
                  <div key={taskId} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
                    <div
                      role="group"
                      aria-label={td("replanDestinationOf", { title })}
                      className="flex gap-0.5 rounded-pill bg-surface/70 p-0.5"
                    >
                      {(["tomorrow", "backlog", "keep"] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={choice === d}
                          onClick={() => setDest((prev) => ({ ...prev, [taskId]: d }))}
                          className={cn(
                            "cursor-pointer rounded-pill px-2.5 py-1 text-2xs font-semibold transition-colors",
                            choice === d ? "bg-surface text-fg shadow-soft" : "text-muted",
                          )}
                        >
                          {td(
                            d === "tomorrow"
                              ? "replanToTomorrow"
                              : d === "backlog"
                                ? "replanToBacklog"
                                : "replanKeep",
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cursor-pointer rounded-pill px-3 py-1.5 text-sm font-semibold text-muted hover:text-fg"
            >
              {td("replanCancel")}
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={changes.length === 0 && strandedTasks.length === 0}
              className="cursor-pointer rounded-pill bg-fg px-4 py-1.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {td("replanApply")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
