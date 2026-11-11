/**
 * The Stint link: one person's tasks from Stint (the agency's app) mirrored
 * here, and their timer moving the task to "doing" there.
 *
 * Stint owns what the task IS (title, client, deadline, whether it's done
 * there); Morchitask owns WHEN you do it (planned day, blocks) and the time
 * you spend. Hours never go back to Stint.
 *
 * Invisible unless the signed-in email is on STINT_LINK_EMAILS (Vercel env,
 * never the repo): the settings card, the sync and the status push all check
 * the same list.
 */

export function canLinkStint(
  email: string | null | undefined,
  list = process.env.STINT_LINK_EMAILS,
): boolean {
  if (!email) return false;
  return (list ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

export type StintStatus = "todo" | "doing" | "review" | "done";

/** One task as Stint's GET /api/link/tasks returns it. */
export type RemoteTask = {
  id: string;
  title: string;
  status: StintStatus;
  client: string | null;
  deadline: string | null;
  url: string;
};

/** The local side of a linked task, as much as the plan needs. */
export type LocalLinked = {
  id: string;
  stint_task_id: string;
  /** Stint's status the last time we saw it: tells a change THERE from one here. */
  stint_status: string | null;
  status: string;
  title: string;
  due_date: string | null;
  notes: string | null;
  hasTime: boolean;
};

export type LocalSet = {
  title?: string;
  due_date?: string | null;
  notes?: string | null;
  status?: "todo" | "done";
  completed_at?: string | null;
  stint_status: StintStatus;
};

export type SyncPlan = {
  create: RemoteTask[];
  update: { id: string; set: LocalSet }[];
  /** Gone from Stint, never touched here: removed. */
  remove: string[];
  /** Gone from Stint, but done or tracked here: kept, no longer linked. */
  unlink: string[];
};

/** The client in front, the way the agency says it: "La Perfecta · Posteo". */
export function localTitle(t: Pick<RemoteTask, "title" | "client">): string {
  return t.client ? `${t.client} · ${t.title}` : t.title;
}

/**
 * What to change locally so it matches Stint.
 *
 * Status is three-way: Stint's status is applied here only when it changed
 * THERE since the last sync (compared with `stint_status`). Otherwise a done
 * here whose push failed would be undone by the next pull.
 */
export function planSync(remote: RemoteTask[], local: LocalLinked[], now: Date): SyncPlan {
  const byRemote = new Map(local.map((l) => [l.stint_task_id, l]));
  const remoteIds = new Set(remote.map((r) => r.id));
  const plan: SyncPlan = { create: [], update: [], remove: [], unlink: [] };

  for (const r of remote) {
    const l = byRemote.get(r.id);
    if (!l) {
      // Already finished before it ever reached here: nothing to plan.
      if (r.status !== "done") plan.create.push(r);
      continue;
    }
    const set: LocalSet = { stint_status: r.status };
    const title = localTitle(r);
    if (l.title !== title) set.title = title;
    if (l.due_date !== r.deadline) set.due_date = r.deadline;
    if (l.notes !== r.url && !l.notes) set.notes = r.url;
    if (r.status !== l.stint_status) {
      if (r.status === "done" && l.status !== "done") {
        set.status = "done";
        set.completed_at = now.toISOString();
      } else if (r.status !== "done" && l.status === "done") {
        set.status = "todo";
        set.completed_at = null;
      }
    }
    if (Object.keys(set).length > 1 || l.stint_status !== r.status)
      plan.update.push({ id: l.id, set });
  }

  for (const l of local) {
    if (remoteIds.has(l.stint_task_id)) continue;
    if (l.status === "done" || l.hasTime) plan.unlink.push(l.id);
    else plan.remove.push(l.id);
  }
  return plan;
}

/**
 * What to tell Stint when something happens here, or null for nothing.
 * Starting the timer only moves a task that was still "todo" there: a task
 * in review must not be pulled back out of it by a stopwatch.
 */
export function pushFor(
  event: "timerStarted" | "done" | "undone",
  stintStatus: string | null,
): "doing" | "done" | "todo" | null {
  if (event === "timerStarted") return stintStatus === "todo" ? "doing" : null;
  if (event === "done") return stintStatus === "done" ? null : "done";
  return stintStatus === "done" ? "doing" : null;
}
