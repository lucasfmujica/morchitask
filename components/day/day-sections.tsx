"use client";

import { Check, Inbox } from "lucide-react";
import { useToggleTask, useMoveTaskToDate, useBacklogTasks } from "@/lib/queries/tasks";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { useToast } from "@/lib/stores/toast";
import type { Channel, Task } from "@/lib/queries/types";
import { formatMinutes } from "@/lib/format";
import { ageLabel } from "@/lib/date";
import { orderForAppend } from "@/lib/ordering";
import { cn } from "@/lib/utils";
import { CollapsibleSection } from "@/components/ui";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";

/** The 3px category rail, shared by both section row types. */
function Rail({ channel }: { channel?: Channel }) {
  return (
    <span
      className={cn("absolute inset-y-0 left-0 w-[3px]", !channel && "bg-border")}
      style={channel ? { background: channel.color } : undefined}
      aria-hidden
    />
  );
}

/**
 * What you already finished, folded away.
 *
 * Completed tasks used to sink to the bottom of the same list, still full-size
 * — on a good day that's more than half the screen spent on work you're done
 * with. Collapsed, the header still carries the score and the measured time,
 * which is the part you actually want at a glance.
 */
export function DoneSection({
  tasks,
  channelsById,
  defaultOpen = false,
}: {
  tasks: Task[];
  channelsById: Map<string, Channel>;
  defaultOpen?: boolean;
}) {
  const toggle = useToggleTask();
  const openDetail = useTaskDetail((s) => s.open);
  const toast = useToast();
  if (tasks.length === 0) return null;

  const measuredMin = tasks.reduce((sum, t) => sum + (t.actual_time_min ?? 0), 0);

  return (
    <CollapsibleSection
      icon={Check}
      iconClassName="text-success"
      defaultOpen={defaultOpen}
      label={
        <>
          {tasks.length} {tasks.length === 1 ? "hecha" : "hechas"}
          {measuredMin > 0 && ` · ${formatMinutes(measuredMin)} medidas`}
        </>
      }
    >
      {tasks.map((task) => {
        const channel = task.channel_id ? channelsById.get(task.channel_id) : undefined;
        return (
          <div
            key={task.id}
            className="relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-border bg-surface py-2.5 pr-3 pl-3.5 opacity-70 transition-opacity hover:opacity-100"
          >
            <Rail channel={channel} />
            <TaskCheckbox
              checked
              onToggle={() => {
                toggle.mutate(task);
                toast("Marcada como pendiente", {
                  label: "Deshacer",
                  run: () => toggle.mutate({ ...task, status: "todo" } as Task),
                });
              }}
              size="sm"
            />
            <button
              onClick={() => openDetail(task)}
              className="min-w-0 flex-1 cursor-pointer truncate rounded text-left text-sm text-subtle line-through focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            >
              {task.title}
            </button>
            {task.actual_time_min ? (
              <span className="shrink-0 text-2xs font-semibold tabular-nums text-muted">
                {formatMinutes(task.actual_time_min)}
              </span>
            ) : null}
          </div>
        );
      })}
    </CollapsibleSection>
  );
}

/**
 * The backlog, at the foot of the day you're looking at.
 *
 * Pulling something in used to mean leaving the day, finding it in /backlog and
 * moving it. Here it's one tap, and the age of each idea is on the row — which
 * is the information that makes "not this week either" an honest answer.
 *
 * Expanded by default on desktop (there's room), collapsed on a phone.
 */
export function UnscheduledSection({
  date,
  channelsById,
  defaultOpen = false,
}: {
  date: string;
  channelsById: Map<string, Channel>;
  defaultOpen?: boolean;
}) {
  const backlogQ = useBacklogTasks();
  const move = useMoveTaskToDate();
  const openDetail = useTaskDetail((s) => s.open);
  const toast = useToast();

  const tasks = backlogQ.data ?? [];
  if (tasks.length === 0) return null;

  const estimatedMin = tasks.reduce((sum, t) => sum + (t.time_estimate_min ?? 0), 0);

  function bringToDay(task: Task) {
    move.mutate({ task, toDate: date, sortOrder: orderForAppend([]) });
    toast(`"${task.title}" va para hoy`, {
      label: "Deshacer",
      run: () =>
        move.mutate({
          task: { ...task, planned_date: date },
          toDate: null,
          sortOrder: task.sort_order,
        }),
    });
  }

  return (
    <CollapsibleSection
      icon={Inbox}
      tone="dashed"
      defaultOpen={defaultOpen}
      label={
        <>
          Sin agendar · {tasks.length} del backlog
          {estimatedMin > 0 && ` · ${formatMinutes(estimatedMin)}`}
        </>
      }
    >
      {tasks.map((task) => {
        const channel = task.channel_id ? channelsById.get(task.channel_id) : undefined;
        return (
          <div
            key={task.id}
            className="relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-border bg-surface py-2 pr-2.5 pl-3.5"
          >
            <Rail channel={channel} />
            <button
              onClick={() => openDetail(task)}
              className="min-w-0 flex-1 cursor-pointer rounded text-left focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            >
              <span className="block truncate text-sm text-fg">{task.title}</span>
              <span className="block truncate text-2xs text-muted">
                {channel ? `#${channel.name} · ` : ""}
                {ageLabel(task.created_at)}
              </span>
            </button>
            {task.time_estimate_min ? (
              <span className="shrink-0 text-2xs font-semibold tabular-nums text-muted">
                {formatMinutes(task.time_estimate_min)}
              </span>
            ) : null}
            <button
              onClick={() => bringToDay(task)}
              className="shrink-0 cursor-pointer rounded-pill bg-primary-soft px-2.5 py-1 text-2xs font-bold text-primary transition-colors hover:bg-primary hover:text-on-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            >
              + Hoy
            </button>
          </div>
        );
      })}
    </CollapsibleSection>
  );
}
