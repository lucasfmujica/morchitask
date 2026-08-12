import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { taskAttachments, tasks } from "@/lib/db/schema";
import type { NewAttachment } from "@/lib/queries/types";

/** Every read/write is scoped to `householdId` from the session, like the rest
 *  of the data layer — the app-level stand-in for row-level security. */

export async function listAttachments(householdId: string, taskId: string) {
  return db
    .select()
    .from(taskAttachments)
    .where(and(eq(taskAttachments.household_id, householdId), eq(taskAttachments.task_id, taskId)))
    .orderBy(asc(taskAttachments.created_at));
}

export async function getAttachment(householdId: string, id: string) {
  const [row] = await db
    .select()
    .from(taskAttachments)
    .where(and(eq(taskAttachments.id, id), eq(taskAttachments.household_id, householdId)));
  return row ?? null;
}

/** True when the task exists inside this household — checked before an upload
 *  token is issued, so a token can't be minted for someone else's task. */
export async function taskBelongsToHousehold(householdId: string, taskId: string) {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.household_id, householdId)));
  return !!row;
}

export async function addAttachment(
  householdId: string,
  taskId: string,
  uploaderId: string,
  file: NewAttachment,
) {
  const [row] = await db
    .insert(taskAttachments)
    .values({
      household_id: householdId,
      task_id: taskId,
      uploader_id: uploaderId,
      url: file.url,
      pathname: file.pathname,
      name: file.name,
      content_type: file.contentType,
      size_bytes: file.sizeBytes,
    })
    .returning();
  return row;
}

/** Returns the deleted row so the caller can remove the blob it points at. */
export async function deleteAttachment(householdId: string, id: string) {
  const [row] = await db
    .delete(taskAttachments)
    .where(and(eq(taskAttachments.id, id), eq(taskAttachments.household_id, householdId)))
    .returning();
  return row ?? null;
}

/** The blob paths of every file on a task — for cleaning up when the task
 *  itself is deleted (the row cascades, the stored file would not). */
export async function taskAttachmentPaths(householdId: string, taskId: string) {
  const rows = await db
    .select({ pathname: taskAttachments.pathname })
    .from(taskAttachments)
    .where(and(eq(taskAttachments.task_id, taskId), eq(taskAttachments.household_id, householdId)));
  return rows.map((r) => r.pathname);
}
