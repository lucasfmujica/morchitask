"use client";

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
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { GripVertical } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { orderBetween } from "@/lib/ordering";
import { EASE_OUT } from "@/lib/motion";
import { useToggleTask } from "@/lib/queries/tasks";
import type { Channel, Profile, Subtask, Task } from "@/lib/queries/types";
import { TaskCard } from "@/components/tasks/task-card";
import { SwipeToComplete } from "@/components/tasks/swipe-to-complete";

const NO_SUBTASKS: Subtask[] = [];

export function SortableTaskList({
  tasks,
  channelsById,
  profilesById,
  subtasksByTaskId,
  onReorder,
}: {
  tasks: Task[];
  channelsById: Map<string, Channel>;
  profilesById: Map<string, Profile>;
  subtasksByTaskId?: Map<string, Subtask[]>;
  onReorder: (task: Task, sortOrder: number) => void;
}) {
  // dnd-kit generates non-deterministic accessibility IDs that mismatch between
  // server and client. Render a plain (non-draggable) list for SSR + first paint,
  // then enable drag-and-drop after hydration. Avoids the hydration warning.
  const mounted = useHydrated();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!mounted) {
    return (
      <ul className="flex flex-col gap-2">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-stretch gap-1">
            <span className="w-5 shrink-0" aria-hidden />
            <div className="flex-1">
              <TaskCard
                task={t}
                channel={t.channel_id ? channelsById.get(t.channel_id) : undefined}
                owner={profilesById.get(t.owner_id)}
                subtasks={subtasksByTaskId?.get(t.id) ?? NO_SUBTASKS}
              />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tasks, oldIndex, newIndex);
    const before = reordered[newIndex - 1]?.sort_order ?? null;
    const after = reordered[newIndex + 1]?.sort_order ?? null;
    onReorder(tasks[oldIndex], orderBetween(before, after));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2">
          {/* motion.li handles enter/exit (opacity); the inner dnd node owns the
              drag transform — separate nodes so the two never fight over transform. */}
          <AnimatePresence initial={false}>
            {tasks.map((t) => (
              <motion.li
                key={t.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
              >
                <SortableRow
                  task={t}
                  channel={t.channel_id ? channelsById.get(t.channel_id) : undefined}
                  owner={profilesById.get(t.owner_id)}
                  subtasks={subtasksByTaskId?.get(t.id) ?? NO_SUBTASKS}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </SortableContext>
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
  });
  const toggle = useToggleTask();
  const done = task.status === "done";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : undefined}
    >
      <div className="flex items-stretch gap-1">
        <button
          {...attributes}
          {...listeners}
          aria-label="Reordenar tarea"
          className="flex w-5 shrink-0 cursor-grab touch-none items-center justify-center text-subtle/60 transition-colors hover:text-muted active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex-1">
          <SwipeToComplete disabled={done} onComplete={() => toggle.mutate(task)}>
            <TaskCard task={task} channel={channel} owner={owner} subtasks={subtasks} />
          </SwipeToComplete>
        </div>
      </div>
    </div>
  );
}
