import { orderBetween, orderForAppend } from "@/lib/ordering";
import type { Task } from "@/lib/queries/types";

/**
 * Task priority: the primary ordering key of the Day and Week views.
 *
 * `null` ("Sin prioridad") is the default and always sorts last, so the feature
 * costs nothing to anyone who never touches it. Everything here is pure — the
 * drag-and-drop resolver included — so the tricky parts live in one tested file.
 */
export type TaskPriority = "high" | "medium" | "low";

/** A priority slot, including the "no priority" bucket. */
export type PriorityKey = TaskPriority | null;

export const TASK_PRIORITIES = ["high", "medium", "low"] as const;

/** Display order of the groups: Alta → Media → Baja → Sin prioridad. */
export const PRIORITY_GROUPS: readonly PriorityKey[] = ["high", "medium", "low", null];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export const NO_PRIORITY_LABEL = "Sin prioridad";

/** Dot/rail colours, as CSS vars from app/globals.css (usable in inline styles). */
export const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--primary)",
};

const RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const NO_PRIORITY_RANK = 3;

export function priorityOf(task: Pick<Task, "priority">): PriorityKey {
  return task.priority ?? null;
}

export function priorityRank(priority: PriorityKey): number {
  return priority === null ? NO_PRIORITY_RANK : RANK[priority];
}

export function priorityLabel(priority: PriorityKey): string {
  return priority === null ? NO_PRIORITY_LABEL : PRIORITY_LABEL[priority];
}

/** Runtime guard — the value reaches `db.update().set()` from the client. */
export function isTaskPriority(value: unknown): value is TaskPriority {
  return value === "high" || value === "medium" || value === "low";
}

/**
 * Regroup a list into Alta → Media → Baja → Sin prioridad. Within a group the
 * incoming order (manual sort_order, done sunk to the bottom) is preserved —
 * `Array.prototype.sort` is stable, so equal ranks keep their relative order.
 *
 * Display-only: never writes sort_order. Returns the *same* array when it is
 * already grouped so `useMemo` consumers keep referential stability.
 */
export function sortByPriority(tasks: Task[]): Task[] {
  for (let i = 1; i < tasks.length; i++) {
    if (priorityRank(priorityOf(tasks[i - 1])) > priorityRank(priorityOf(tasks[i]))) {
      return [...tasks].sort((a, b) => priorityRank(priorityOf(a)) - priorityRank(priorityOf(b)));
    }
  }
  return tasks;
}

/** One row of a grouped list: either a group separator or a task card. */
export type PriorityRow =
  | { kind: "header"; priority: PriorityKey; count: number; empty: boolean }
  | { kind: "task"; task: Task };

/**
 * Turn an ordered list into the sequence a grouped view renders.
 *
 * Headers are skipped entirely when every task shares one group — a lone
 * "SIN PRIORIDAD" banner over an untouched list is pure noise. `includeEmpty`
 * (set while a drag is in progress) adds a strip for every missing group so you
 * always have somewhere to drop.
 */
export function priorityRows(
  tasks: Task[],
  { includeEmpty = false }: { includeEmpty?: boolean } = {},
): PriorityRow[] {
  const present = new Set(tasks.map(priorityOf));
  if (!includeEmpty && present.size <= 1) return tasks.map((task) => ({ kind: "task", task }));

  const rows: PriorityRow[] = [];
  for (const priority of PRIORITY_GROUPS) {
    const inGroup = tasks.filter((t) => priorityOf(t) === priority);
    if (inGroup.length === 0) {
      if (includeEmpty) rows.push({ kind: "header", priority, count: 0, empty: true });
      continue;
    }
    rows.push({ kind: "header", priority, count: inGroup.length, empty: false });
    for (const task of inGroup) rows.push({ kind: "task", task });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Drag & drop
// ---------------------------------------------------------------------------

const DROP_PREFIX = "prio::";
const NO_PRIORITY_KEY = "none";

/** Droppable id for a priority group header / empty strip.
 *  `scope` is the ISO date of the day it belongs to (Week has one per column). */
export function priorityDropId(scope: string, priority: PriorityKey): string {
  return `${DROP_PREFIX}${scope}::${priority ?? NO_PRIORITY_KEY}`;
}

export function parsePriorityDropId(id: string): { scope: string; priority: PriorityKey } | null {
  if (!id.startsWith(DROP_PREFIX)) return null;
  const rest = id.slice(DROP_PREFIX.length);
  // `::` and not `:` because ISO dates are safe but scopes are free-form; use
  // the LAST separator so the scope can contain anything.
  const sep = rest.lastIndexOf("::");
  if (sep <= 0) return null;
  const key = rest.slice(sep + 2);
  if (key !== NO_PRIORITY_KEY && !isTaskPriority(key)) return null;
  return { scope: rest.slice(0, sep), priority: key === NO_PRIORITY_KEY ? null : key };
}

export type PriorityDropTarget =
  /** Dropped onto another card — the dragged task adopts that card's priority. */
  | { kind: "task"; task: Task }
  /** Dropped onto a group header or an empty-group strip. */
  | { kind: "group"; priority: PriorityKey }
  /** Dropped onto the list/column background — the task keeps its own priority. */
  | { kind: "list" };

export type TaskDrop = { priority: PriorityKey; sortOrder: number };

/**
 * Where a dragged card lands: the priority of the group it was dropped into and
 * its fractional sort_order *inside that group*.
 *
 * `ordered` is the target list in display order (already grouped). It contains
 * `active` for a same-day reorder and does not for a cross-day move — both work.
 * Returns null when nothing would change.
 *
 * The subtle part: sort_order is a per-day global scale with no relation to
 * priority, so anchoring on a neighbour from another group produces a value that
 * renders on the wrong side of the drop. Since `orderTasksForDisplay` makes each
 * group a contiguous run, an adjacent card from another group means "I'm at this
 * group's edge" and is treated as no neighbour at all.
 */
export function resolveTaskDrop(
  ordered: Task[],
  active: Task,
  target: PriorityDropTarget,
): TaskDrop | null {
  const list = ordered.filter((t) => t.id !== active.id);

  let priority: PriorityKey;
  let insertAt: number;

  if (target.kind === "task") {
    if (target.task.id === active.id) return null;
    const overIdx = list.findIndex((t) => t.id === target.task.id);
    if (overIdx === -1) return null;
    priority = priorityOf(target.task);
    // dnd-kit semantics: dragging *down* within the same list lands after the
    // hovered card; dragging up — or arriving from another day — lands before it.
    const fromIdx = ordered.findIndex((t) => t.id === active.id);
    const overOrderedIdx = ordered.findIndex((t) => t.id === target.task.id);
    insertAt = fromIdx !== -1 && fromIdx < overOrderedIdx ? overIdx + 1 : overIdx;
  } else {
    priority = target.kind === "group" ? target.priority : priorityOf(active);
    const first = list.findIndex((t) => priorityOf(t) === priority);
    const size = list.filter((t) => priorityOf(t) === priority).length;
    // A header / empty strip means "top of this group"; a bare background drop
    // means "end of my own group".
    insertAt = first === -1 ? list.length : target.kind === "group" ? first : first + size;
  }

  const prev = list[insertAt - 1];
  const next = list[insertAt];
  const before = prev && priorityOf(prev) === priority ? prev.sort_order : null;
  const after = next && priorityOf(next) === priority ? next.sort_order : null;

  const sortOrder =
    before === null && after === null
      ? // The target group is empty — pick a value past everything so the new
        // member can't tie with a task from a neighbouring group.
        orderForAppend(list.map((t) => t.sort_order))
      : orderBetween(before, after);

  if (priority === priorityOf(active) && sortOrder === active.sort_order) return null;
  return { priority, sortOrder };
}
