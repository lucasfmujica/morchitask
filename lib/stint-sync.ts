import "server-only";
import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/stint";
import { canLinkStint, planSync, pushFor } from "@/lib/stint";
import { fetchStintTasks, pushStintStatus, StintUnauthorized } from "@/lib/stint-api";

/**
 * The two directions of the Stint link. Not server actions themselves (they
 * take ids the caller must already have checked against the session), so
 * they live outside lib/actions.
 */

export async function signedInLinkable() {
  const session = await auth();
  if (!session?.householdId || !canLinkStint(session.user.email)) return null;
  return { householdId: session.householdId, userId: session.user.id };
}

export type SyncResult = { ok: true; changed: boolean } | { ok: false; error: "token" | "network" };

/** Pull from Stint and bring this person's mirror up to date. */
export async function syncStintFor(householdId: string, userId: string): Promise<SyncResult> {
  const link = await data.getStintLink(householdId, userId);
  if (!link) return { ok: true, changed: false };
  let remote;
  try {
    remote = await fetchStintTasks(link.token);
  } catch (e) {
    return { ok: false, error: e instanceof StintUnauthorized ? "token" : "network" };
  }
  const local = await data.linkedTasks(householdId, userId);
  const plan = planSync(remote.tasks, local, new Date());
  const changed =
    plan.create.length + plan.update.length + plan.remove.length + plan.unlink.length > 0;
  if (changed) {
    const channelId = await data.stintChannel(householdId, userId, remote.workspaceName);
    await data.applyStintPlan(householdId, userId, channelId, plan);
  }
  await data.markStintSynced(householdId, userId);
  return { ok: true, changed };
}

/**
 * Tell Stint about something that happened to one of your tasks here. Best
 * effort: a failure leaves `stint_status` as it was, and the next pull
 * neither undoes your change here nor pretends Stint got it.
 */
export async function pushToStint(
  householdId: string,
  userId: string,
  taskId: string,
  event: "timerStarted" | "done" | "undone",
) {
  const state = await data.stintStateOf(householdId, userId, taskId);
  if (!state) return;
  const to = pushFor(event, state.stintStatus);
  if (!to) return;
  const link = await data.getStintLink(householdId, userId);
  if (!link || !(await signedInLinkable())) return;
  const now = await pushStintStatus(link.token, state.stintTaskId!, to).catch(() => null);
  if (now) await data.setStintStatus(householdId, userId, taskId, now);
}
