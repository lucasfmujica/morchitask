"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { GripVertical } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { useCoarsePointer } from "@/lib/use-coarse-pointer";
import {
  parsePriorityDropId,
  priorityRows,
  resolveTaskDrop,
  type PriorityKey,
} from "@/lib/priority";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useToggleTask } from "@/lib/queries/tasks";
import type { Channel, Profile, Subtask, Task } from "@/lib/queries/types";
import { useTaskTimer } from "@/components/tasks/use-task-timer";
import { PriorityGroupHeader } from "@/components/tasks/priority-group-header";
import { TaskCard } from "@/components/tasks/task-card";
import { SwipeToComplete } from "@/components/tasks/swipe-to-complete";
import { createTaskCollision } from "./collision";

const NO_SUBTASKS: Subtask[] = [];

/** Cards win over group strips; strips are the fallback when nothing else hits. */
const listCollision = createTaskCollision({ fallback: closestCenter });

export function SortableTaskList({
  tasks,
  channelsById,
  profilesById,
  subtasksByTaskId,
  onReorder,
  hosted = false,
  grouped = false,
  scope = "",
  dragging = false,
}: {
  tasks: Task[];
  channelsById: Map<string, Channel>;
  profilesById: Map<string, Profile>;
  subtasksByTaskId?: Map<string, Subtask[]>;
  onReorder: (task: Task, sortOrder: number, priority?: PriorityKey) => void;
  /** When true, a parent owns the DndContext (the day view shares one context
   *  with the agenda so tasks can be dragged onto the calendar). Reordering is
   *  then handled by the parent's onDragEnd. */
  hosted?: boolean;
  /** Show priority group separators (and drop strips for empty groups). */
  grouped?: boolean;
  /** Day this list belongs to — scopes the group droppable ids. */
  scope?: string;
  /** A drag is in progress: reveal a strip for every empty group. */
  dragging?: boolean;
}) {
  // dnd-kit generates non-deterministic accessibility IDs that mismatch between
  // server and client. Render a plain (non-draggable) list for SSR + first paint,
  // then enable drag-and-drop after hydration. Avoids the hydration warning.
  const mounted = useHydrated();
  // `dragging` comes from the parent when hosted; standalone lists track it here.
  const [selfDragging, setSelfDragging] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Empty-group strips only appear mid-drag, so the resting list stays quiet.
  const rows = grouped ? priorityRows(tasks, { includeEmpty: dragging || selfDragging }) : null;

  if (!mounted) {
    // Same headers as the hydrated branch (minus the droppable) so the first
    // paint matches — but never the drag-only strips, which can't exist on SSR.
    const staticRows = grouped ? priorityRows(tasks) : null;
    return (
      <ul className="flex flex-col gap-2">
        {(staticRows ?? tasks.map((task) => ({ kind: "task" as const, task }))).map((row) =>
          row.kind === "header" ? (
            <li key={`prio-${row.priority ?? "none"}`} className="pt-1 first:pt-0">
              <PriorityGroupHeader scope={scope} priority={row.priority} count={row.count} />
            </li>
          ) : (
            <li key={row.task.id} className="flex items-stretch gap-1">
              <span className="w-5 shrink-0" aria-hidden />
              <div className="flex-1">
                <TaskCard
                  task={row.task}
                  channel={row.task.channel_id ? channelsById.get(row.task.channel_id) : undefined}
                  owner={profilesById.get(row.task.owner_id)}
                  subtasks={subtasksByTaskId?.get(row.task.id) ?? NO_SUBTASKS}
                />
              </div>
            </li>
          ),
        )}
      </ul>
    );
  }

  const list = (
    // Headers are NOT sortable items — the item list stays exactly the task ids,
    // so dnd-kit's ids and measurements are unchanged by grouping.
    <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
      <ul className="flex flex-col gap-2">
        {/* motion.li handles enter/exit (opacity); the inner dnd node owns the
            drag transform — separate nodes so the two never fight over transform. */}
        <AnimatePresence initial={false}>
          {(rows ?? tasks.map((task) => ({ kind: "task" as const, task }))).map((row) =>
            row.kind === "header" ? (
              <motion.li
                key={`prio-${row.priority ?? "none"}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                className="pt-1 first:pt-0"
              >
                <PriorityGroupHeader
                  scope={scope}
                  priority={row.priority}
                  count={row.empty ? undefined : row.count}
                  empty={row.empty}
                />
              </motion.li>
            ) : (
              <motion.li
                key={row.task.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
              >
                <SortableRow
                  task={row.task}
                  channel={row.task.channel_id ? channelsById.get(row.task.channel_id) : undefined}
                  owner={profilesById.get(row.task.owner_id)}
                  subtasks={subtasksByTaskId?.get(row.task.id) ?? NO_SUBTASKS}
                />
              </motion.li>
            ),
          )}
        </AnimatePresence>
      </ul>
    </SortableContext>
  );

  // Hosted: the parent DndContext drives both reorder and drag-to-calendar.
  if (hosted) return list;

  function handleDragEnd(event: DragEndEvent) {
    setSelfDragging(false);
    const { active, over } = event;
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;

    const group = parsePriorityDropId(String(over.id));
    const overTask = group ? undefined : tasks.find((t) => t.id === over.id);
    if (!group && !overTask) return;

    const drop = resolveTaskDrop(
      tasks,
      task,
      group ? { kind: "group", priority: group.priority } : { kind: "task", task: overTask! },
    );
    if (!drop) return;
    onReorder(task, drop.sortOrder, grouped ? drop.priority : undefined);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={listCollision}
      onDragEnd={handleDragEnd}
      onDragStart={() => setSelfDragging(true)}
      onDragCancel={() => setSelfDragging(false)}
    >
      {list}
    </DndContext>
  );
}

function SortableRow({
  task,
  channel,
  owner,
  subtasks,
}: {
  task: Task;
  channel?: Channel;
  owner?: Profile;
  subtasks?: Subtask[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });
  const coarse = useCoarsePointer();
  const toggle = useToggleTask();
  const timer = useTaskTimer(task);
  const done = task.status === "done";
  const handle = { ...attributes, ...listeners };

  /** Completing a task must also stop its stopwatch — otherwise a swipe leaves
   *  it ticking in the floating bar with no card to stop it from. */
  function complete() {
    if (timer.running) timer.stopTimer();
    toggle.mutate(task);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-stretch gap-1",
        isDragging && "relative z-10 opacity-80",
        // Desktop: the whole card is the drag handle (no swipe to conflict, and
        // the title is a button so a plain click still opens the detail). A 6px
        // threshold keeps clicks working. Touch: only the grip drags so
        // swipe-to-complete on the card body stays usable.
        !coarse && "cursor-grab active:cursor-grabbing",
      )}
      {...(coarse ? {} : handle)}
    >
      <button
        {...(coarse ? handle : {})}
        aria-label="Reordenar o arrastrar al calendario"
        tabIndex={coarse ? 0 : -1}
        className="flex w-5 shrink-0 cursor-grab touch-none items-center justify-center text-subtle/60 transition-colors hover:text-muted active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <SwipeToComplete disabled={done} onComplete={complete}>
          <TaskCard task={task} channel={channel} owner={owner} subtasks={subtasks} />
        </SwipeToComplete>
      </div>
    </div>
  );
}
