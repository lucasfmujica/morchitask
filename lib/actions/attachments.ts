"use server";

import { del } from "@vercel/blob";
import { isAllowedType, isBlobUrlFor, isValidAttachmentPath } from "@/lib/attachments";
import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/attachments";
import type { NewAttachment } from "@/lib/queries/types";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId, userId: session.user.id };
}

export async function getAttachments(taskId: string) {
  const { householdId } = await requireSession();
  return data.listAttachments(householdId, taskId);
}

/**
 * Record a file the browser already uploaded to Blob.
 *
 * Everything here arrives from the client, so nothing here is trusted: the path
 * has to be one this app would have issued for this task, the URL has to point
 * at that exact path, and the task has to belong to the session's household.
 * Together those mean the row can only ever describe a file that really was
 * uploaded to this task.
 */
export async function addAttachment(taskId: string, file: NewAttachment) {
  const { householdId, userId } = await requireSession();

  if (!isValidAttachmentPath(file.pathname, taskId)) throw new Error("invalid path");
  if (!isBlobUrlFor(file.url, file.pathname)) throw new Error("invalid url");
  if (!isAllowedType(file.contentType)) throw new Error("invalid type");
  if (!(await data.taskBelongsToHousehold(householdId, taskId))) throw new Error("task not found");

  // The device's file name is shown as-is in the app; a very long one would
  // only ever be truncated on screen, so it's cut here instead of stored whole.
  const name = file.name.trim().slice(0, 200) || "archivo";
  const sizeBytes = Number.isFinite(file.sizeBytes) ? Math.max(0, Math.round(file.sizeBytes)) : 0;

  return data.addAttachment(householdId, taskId, userId, { ...file, name, sizeBytes });
}

/** Remove an attachment — the row and the stored file, in that order. */
export async function deleteAttachment(id: string) {
  const { householdId } = await requireSession();
  const row = await data.deleteAttachment(householdId, id);
  if (!row) return;
  // Best effort: if Blob is unreachable the row is already gone, and a stray
  // file costs storage but never shows up in the app. Failing the whole call
  // here would be worse — the person would retry a delete that already happened.
  try {
    await del(row.url);
  } catch {
    // ignore
  }
}
