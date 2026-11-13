import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { taskAttachments, tasks } from "@/lib/db/schema";
import type { NewAttachment } from "@/lib/queries/types";
import { assertVisibleTask, onVisibleTask, visibleTask } from "./visibility";

/** Every read/write is scoped to `householdId` from the session, like the rest
 *  of the data layer — the app-level stand-in for row-level security — and to
 *  the tasks the caller may see: a file is as private as its task. */

export async function listAttachments(householdId: string, userId: string, taskId: string) {
  return db
    .select()
    .from(taskAttachments)
    .where(
      and(
        eq(taskAttachments.household_id, householdId),
        eq(taskAttachments.task_id, taskId),
        onVisibleTask(householdId, userId, taskAttachments.task_id),
      ),
    )
    .orderBy(asc(taskAttachments.created_at));
}

export async function getAttachment(householdId: string, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(taskAttachments)
    .where(
      and(
        eq(taskAttachments.id, id),
        eq(taskAttachments.household_id, householdId),
        onVisibleTask(householdId, userId, taskAttachments.task_id),
      ),
    );
  return row ?? null;
}

/** True when the task exists inside this household and the caller may see it
 *  — checked before an upload token is issued, so a token can't be minted for
 *  someone else's task, nor for the partner's private one. */
export async function taskVisibleTo(householdId: string, userId: string, taskId: string) {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(visibleTask(householdId, userId, taskId));
  return !!row;
}

export async function addAttachment(
  householdId: string,
  taskId: string,
  uploaderId: string,
  file: NewAttachment,
) {
  await assertVisibleTask(householdId, uploaderId, taskId);
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
export async function deleteAttachment(householdId: string, userId: string, id: string) {
  const [row] = await db
    .delete(taskAttachments)
    .where(
      and(
        eq(taskAttachments.id, id),
        eq(taskAttachments.household_id, householdId),
        onVisibleTask(householdId, userId, taskAttachments.task_id),
      ),
    )
    .returning();
  return row ?? null;
}

/** The blob paths of every file on a task — for cleaning up when the task
 *  itself is deleted (the row cascades, the stored file would not). */
export async function taskAttachmentPaths(householdId: string, userId: string, taskId: string) {
  const rows = await db
    .select({ pathname: taskAttachments.pathname })
    .from(taskAttachments)
    .where(
      and(
        eq(taskAttachments.task_id, taskId),
        eq(taskAttachments.household_id, householdId),
        onVisibleTask(householdId, userId, taskAttachments.task_id),
      ),
    );
  return rows.map((r) => r.pathname);
}
