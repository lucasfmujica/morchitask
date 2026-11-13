"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { Task, TaskBlock } from "@/lib/queries/types";
import { useMoveTaskToDate } from "@/lib/queries/tasks";
import { useToast } from "@/lib/stores/toast";
import { addDays } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import { orderForAppend } from "@/lib/ordering";
import { MIN_SCHEDULABLE_MIN, remainingMin, type BusyRange } from "@/lib/scheduling";
import { isNoop, replanFromNow, roundUpTo, type ReplanItem } from "@/lib/replan";
import { cn } from "@/lib/utils";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { blockEndMin, blockStartMin, minutesToHHMM } from "./use-agenda-scheduling";

type Destination = "tomorrow" | "backlog" | "keep";
/** A calendar event as the replan sees it: a wall with a name. */
export type ReplanEvent = BusyRange & { title: string };

/** The preview agenda's scale, from the canvas: 44px an hour, 12px of air on top. */
const ROW = 44;
const TOP = 12;

/**
 * "Reacomodar desde ahora" (née "Se me rompió el día"): re-packs what is left
 * of today from now on, around calendar events and finished work.
 *
 * A modal sheet with a preview agenda: it opens on the proposal, with the
 * blocks gliding from where they were to where they'd go, and "Deshacer"
 * shows the day as it stands. Nothing is written until "Listo, así queda",
 * because a planner that silently rearranges your afternoon is worse than one
 * that lets it fall apart. The packing itself is `lib/replan.ts`.
 */
export function ReplanPanel({
  date,
  tasks,
  blocksByTask,
  calendarEvents,
  nowMin,
  endMin,
  meId,
  moveBlock,
  scheduleNewBlock,
  toneFor,
  onClose,
}: {
  date: string;
  tasks: Task[];
  blocksByTask: Map<string, TaskBlock[]>;
  calendarEvents: ReplanEvent[];
  nowMin: number;
  endMin: number;
  meId: string | undefined;
  moveBlock: (block: TaskBlock, startMin: number) => void;
  scheduleNewBlock: (task: Task, startMin: number, durMin: number) => void;
  /** The task's agenda pastel (bg-agenda-N), so the preview reads like Hoy. */
  toneFor: (task: Task) => string;
  /** Mounted only while open (from Hoy's header); this closes it. */
  onClose: () => void;
}) {
  const td = useTranslations("day");
  const move = useMoveTaskToDate();
  const toast = useToast();
  const titleId = useId();
  const [dest, setDest] = useState<Record<string, Destination>>({});
  // "after" is the proposal, "before" the day as it stands (Deshacer).
  const [view, setView] = useState<"before" | "after">("after");
  // The preview opens on the old positions and glides to the new ones, so
  // you see what moved instead of being told.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), 350);
    return () => clearTimeout(id);
  }, []);
  const after = view === "after" && settled;

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const { items, fixed, blocksById, lateCount } = useMemo(() => {
    const items: ReplanItem[] = [];
    const fixed: BusyRange[] = [...calendarEvents];
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
  }, [tasks, blocksByTask, calendarEvents, meId, nowMin]);

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
  const nothing = changes.length === 0 && strandedTasks.length === 0;

  function apply() {
    if (nothing) {
      onClose();
      return;
    }
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
    onClose();
    toast(td("replanDone", { moved: changes.length, parked }));
  }

  // What's left to do once the stranded work leaves the day: the proposal
  // always fits, the day as it stands may not.
  const overflowMin = plan.overflow.reduce((sum, o) => sum + o.durMin, 0);
  const keptMin = plan.neededMin - overflowMin;
  const over = plan.neededMin > plan.freeMin;
  const shownNeed = view === "after" ? keptMin : plan.neededMin;
  const needOver = view === "before" && over;

  // ── The preview agenda ────────────────────────────────────────────────
  type Bar = {
    key: string;
    title: string;
    startMin: number;
    endMin: number;
    tone: string;
    tag?: { label: string; className: string };
    ring?: string;
    past?: boolean;
    hidden?: boolean;
    entering?: boolean;
  };
  const movedTo = new Map(plan.moves.map((m) => [m.blockId, m.startMin]));
  const bars: Bar[] = [];
  for (const task of tasks) {
    for (const block of blocksByTask.get(task.id) ?? []) {
      const from = blockStartMin(block);
      const dur = blockEndMin(block) - from;
      if (!blocksById.has(block.id)) {
        // A wall: finished work, or someone else's.
        const done = task.status === "done";
        bars.push({
          key: block.id,
          title: task.title,
          startMin: from,
          endMin: from + dur,
          tone: toneFor(task),
          past: from + dur <= nowMin,
          tag: done
            ? { label: td("replanTagDone"), className: "bg-primary-soft text-primary" }
            : undefined,
        });
        continue;
      }
      const to = movedTo.get(block.id);
      const leaves = (dest[task.id] ?? "tomorrow") !== "keep" && strandedTasks.includes(task.id);
      const start = after && to != null ? to : from;
      const late = !after && from < nowMin;
      bars.push({
        key: block.id,
        title: task.title,
        startMin: start,
        endMin: start + dur,
        tone: toneFor(task),
        ring: late ? "shadow-[inset_0_0_0_2px_var(--color-accent-hatch)]" : undefined,
        tag: late
          ? {
              label: from + dur <= nowMin ? td("replanTagLate") : td("replanTagNow"),
              className: "bg-accent-soft text-accent",
            }
          : undefined,
        hidden: after && to == null && leaves,
      });
    }
  }
  // Loose time that gets its first block: only exists in the proposal.
  for (const m of plan.moves) {
    if (m.blockId != null) continue;
    const task = tasksById.get(m.taskId);
    if (!task || !after) continue;
    bars.push({
      key: `loose-${m.taskId}`,
      title: task.title,
      startMin: m.startMin,
      endMin: m.startMin + m.durMin,
      tone: toneFor(task),
      entering: true,
    });
  }
  calendarEvents.forEach((e, i) =>
    bars.push({
      key: `event-${i}`,
      title: e.title,
      startMin: e.startMin,
      endMin: e.endMin,
      tone: "bg-surface",
      ring: "shadow-[inset_0_0_0_1.5px_var(--color-border-strong)]",
      past: e.endMin <= nowMin,
      tag: { label: td("replanTagCalendar"), className: "bg-surface-2 text-muted" },
    }),
  );

  const starts = bars.map((b) => b.startMin);
  const ends = bars.map((b) => b.endMin);
  const fromHour = Math.floor(Math.min(9 * 60, nowMin, ...starts) / 60);
  const toHour = Math.min(24, Math.ceil(Math.max(endMin, nowMin, ...ends) / 60));
  const y = (min: number) => TOP + ((min - fromHour * 60) / 60) * ROW;
  const gridHeight = TOP + (toHour - fromHour) * ROW + 18;
  const nowY = Math.min(Math.max(y(nowMin), 0), gridHeight);
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i);

  const destLabel = (d: Destination) =>
    td(d === "tomorrow" ? "replanToTomorrow" : d === "backlog" ? "replanToBacklog" : "replanKeep");

  return (
    <ModalDialog
      onClose={onClose}
      labelledBy={titleId}
      className="bg-bg text-fg md:w-[920px] md:max-w-[calc(100%-32px)]"
    >
      <div className="flex flex-col gap-4 p-4 pb-0">
        <header className="flex items-start gap-3 px-2 pt-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
              {td("replanEyebrow", { time: minutesToHHMM(nowMin) })}
            </span>
            <h2
              id={titleId}
              className="m-0 font-display text-[26px] leading-8 font-semibold tracking-[-0.01em] md:text-[32px] md:leading-9"
            >
              {td("replanTitle")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={td("replanClose")}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        {view === "before" && lateCount > 0 && (
          <p className="animate-up rounded-[22px] bg-accent-soft py-3 pr-3 pl-[18px] text-xs text-fg [animation-delay:80ms]">
            {td.rich("replanLateBanner", {
              n: lateCount,
              b: (chunks) => <b className="font-semibold">{chunks}</b>,
            })}
          </p>
        )}

        <div className="flex flex-wrap items-start gap-4">
          <section
            aria-label={td("agendaTitle")}
            className="min-w-0 flex-[1_1_420px] animate-up rounded-[28px] bg-surface-2 p-2 [animation-delay:120ms]"
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <h3 className="m-0 font-display text-lg font-semibold">{td("agendaTitle")}</h3>
              <span className="font-mono text-2xs text-muted">
                {td("agendaRange", {
                  from: minutesToHHMM(fromHour * 60),
                  to: minutesToHHMM(toHour * 60),
                })}
              </span>
            </div>
            <div
              className="relative overflow-hidden rounded-[22px] bg-surface"
              style={{ height: gridHeight }}
            >
              {/* What's already behind you, hatched. */}
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 bg-[repeating-linear-gradient(135deg,var(--color-bg)_0_8px,var(--color-surface)_8px_16px)]"
                style={{ height: nowY }}
              />
              {hours.map((h) => (
                <div
                  key={h}
                  aria-hidden
                  className="absolute right-3 left-3 flex items-center gap-2.5"
                  style={{ top: y(h * 60) - 7 }}
                >
                  <span className="w-9 font-mono text-[11px] text-subtle">
                    {minutesToHHMM(h * 60)}
                  </span>
                  <span className="h-px flex-1 bg-surface-2" />
                </div>
              ))}
              <ul aria-label={td("agendaTitle")}>
                {bars.map((b) => {
                  const height = Math.max(((b.endMin - b.startMin) / 60) * ROW - 3, 8);
                  return (
                    <li
                      key={b.key}
                      className={cn(
                        "absolute right-3.5 left-[60px] box-border flex items-center gap-2 overflow-hidden rounded-[12px] px-3 transition-[top,height,background,box-shadow,opacity] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]",
                        b.tone,
                        b.ring,
                        b.past && "opacity-60",
                        b.hidden && "opacity-0",
                        b.entering && "animate-pop-soft [animation-delay:500ms]",
                        // A quarter hour is 8px: padding would push its title out.
                        height >= 24 && "py-[5px]",
                      )}
                      style={{ top: y(b.startMin), height }}
                    >
                      <span className="min-w-0 flex-1 truncate text-2xs font-semibold">
                        {b.title}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted">
                        {td("agendaRange", {
                          from: minutesToHHMM(b.startMin),
                          to: minutesToHHMM(b.endMin),
                        })}
                      </span>
                      {b.tag && (
                        <span
                          className={cn(
                            "shrink-0 rounded-pill px-[7px] py-0.5 text-[10px] font-bold",
                            b.tag.className,
                          )}
                        >
                          {b.tag.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {nowMin >= fromHour * 60 && nowMin <= toHour * 60 && (
                <div
                  aria-hidden
                  className="absolute right-3 left-[52px] flex -translate-y-1/2 items-center"
                  style={{ top: nowY }}
                >
                  <span className="h-2.5 w-2.5 animate-now rounded-pill bg-accent" />
                  <span className="h-0.5 flex-1 bg-accent" />
                </div>
              )}
            </div>
          </section>

          <section
            aria-label={td("replanTitle")}
            // On a phone the verdict comes first; the tall preview agenda
            // sits under it instead of pushing it off the sheet.
            className="flex min-w-0 flex-[1_1_340px] animate-up flex-col gap-3.5 [animation-delay:180ms] max-md:order-first"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5 rounded-[24px] bg-surface-2 p-4">
                <span className="text-2xs text-muted">{td("replanFree")}</span>
                <span className="font-display text-[26px] leading-8 font-semibold tabular-nums">
                  {formatMinutes(plan.freeMin)}
                </span>
                <span className="text-[11px] text-muted">
                  {td("replanFreeUntil", { time: minutesToHHMM(endMin) })}
                </span>
              </div>
              <div
                className={cn(
                  "flex flex-col gap-0.5 rounded-[24px] p-4 transition-[background] duration-400",
                  needOver ? "bg-accent-soft" : "bg-primary-soft",
                )}
              >
                <span className="text-2xs text-muted">{td("replanNeeded")}</span>
                <span className="font-display text-[26px] leading-8 font-semibold tabular-nums">
                  {formatMinutes(shownNeed)}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-semibold",
                    needOver ? "text-accent" : "text-primary",
                  )}
                >
                  {needOver
                    ? td("replanOverBy", { time: formatMinutes(plan.neededMin - plan.freeMin) })
                    : td("replanFitsBy", { time: formatMinutes(plan.freeMin - shownNeed) })}
                </span>
              </div>
            </div>

            {view === "before" ? (
              <div className="flex flex-col gap-2.5 rounded-[24px] bg-surface p-[18px] shadow-tile">
                <h3 className="m-0 font-sans text-sm font-semibold">{td("replanHowTitle")}</h3>
                <p className="m-0 text-xs leading-[19px] text-muted">{td("replanHowBody")}</p>
              </div>
            ) : (
              <>
                <div className="flex animate-pop-soft flex-col gap-0.5 rounded-[24px] bg-surface p-2 shadow-tile">
                  <h3 className="m-0 px-2.5 pt-2.5 pb-1 font-sans text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                    {td("replanMoves")}
                  </h3>
                  {changes.length > 0 ? (
                    <ul>
                      {changes.map((m) => (
                        <li
                          key={`${m.taskId}-${m.blockId ?? "loose"}`}
                          className="flex items-center gap-2.5 px-2.5 py-2 text-xs"
                        >
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            {tasksById.get(m.taskId)?.title}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-subtle line-through">
                            {m.fromStartMin == null
                              ? td("replanLoose")
                              : minutesToHHMM(m.fromStartMin)}
                          </span>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="shrink-0 text-muted"
                            aria-hidden
                          >
                            <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" />
                          </svg>
                          <span className="shrink-0 rounded-pill bg-primary-soft px-[7px] py-0.5 font-mono text-[11px]">
                            {minutesToHHMM(m.startMin)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="m-0 px-2.5 pt-1 pb-2.5 text-xs text-muted">
                      {td("replanNothing")}
                    </p>
                  )}
                </div>

                {strandedTasks.map((taskId) => {
                  const task = tasksById.get(taskId);
                  const title = task?.title ?? "";
                  const choice = dest[taskId] ?? "tomorrow";
                  const mins = plan.overflow
                    .filter((o) => o.taskId === taskId)
                    .reduce((sum, o) => sum + o.durMin, 0);
                  return (
                    <div
                      key={taskId}
                      className="flex animate-pop-soft flex-col gap-2.5 rounded-[24px] bg-agenda-4 px-4 py-3.5 [animation-delay:120ms]"
                    >
                      <p className="m-0 text-xs">
                        {td.rich("replanNoRoomItem", {
                          title,
                          time: formatMinutes(mins),
                          b: (chunks) => <b className="font-semibold">{chunks}</b>,
                        })}
                      </p>
                      <div
                        role="group"
                        aria-label={td("replanDestinationOf", { title })}
                        className="flex gap-0.5 self-start rounded-pill bg-surface/60 p-[3px]"
                      >
                        {(["tomorrow", "backlog", "keep"] as const).map((d) => (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={choice === d}
                            onClick={() => setDest((prev) => ({ ...prev, [taskId]: d }))}
                            className={cn(
                              "h-8 cursor-pointer rounded-pill px-3.5 text-2xs font-semibold transition-colors",
                              choice === d ? "bg-surface text-fg" : "bg-transparent text-muted",
                            )}
                          >
                            {destLabel(d)}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </section>
        </div>
      </div>

      {/* Pinned to the sheet's foot: on a phone the agenda preview is tall and
          the verb must not scroll away. */}
      <div className="sticky bottom-0 flex gap-2 bg-bg px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] md:justify-end">
        <button
          type="button"
          onClick={view === "after" ? () => setView("before") : onClose}
          className="h-11 cursor-pointer rounded-pill bg-transparent px-[18px] font-semibold text-muted transition-colors hover:text-fg"
        >
          {view === "after" ? td("replanUndo") : td("replanCancel")}
        </button>
        <button
          type="button"
          onClick={view === "after" ? apply : () => setView("after")}
          className="flex h-11 flex-1 animate-glow cursor-pointer items-center justify-center rounded-pill bg-fg px-[18px] font-semibold text-bg transition-opacity hover:opacity-90 md:max-w-[340px]"
        >
          {view === "after" ? td("replanConfirm") : td("replanButton")}
        </button>
      </div>
    </ModalDialog>
  );
}
