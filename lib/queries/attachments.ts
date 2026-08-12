import { upload } from "@vercel/blob/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { attachmentPath } from "@/lib/attachments";
import {
  addAttachment as addAttachmentAction,
  deleteAttachment as deleteAttachmentAction,
  getAttachments,
} from "@/lib/actions/attachments";
import type { TaskAttachment } from "./types";

export const attachmentKeys = {
  task: (taskId: string) => ["attachments", taskId] as const,
};

/** Files on a task, oldest first. Visible to whoever can see the task. */
export function useAttachments(taskId: string) {
  return useQuery({
    queryKey: attachmentKeys.task(taskId),
    queryFn: (): Promise<TaskAttachment[]> => getAttachments(taskId),
  });
}

/**
 * Upload a file and attach it to the task.
 *
 * Two steps on purpose: the bytes go from the browser straight to Blob (a
 * Server Action would cap out around 1 MB), and only then does a small action
 * record the resulting URL. `/api/attachments/upload` is what authorises step
 * one; nothing is stored against the task until step two succeeds.
 */
export function useUploadAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<TaskAttachment> => {
      const blob = await upload(attachmentPath(taskId, file.name, crypto.randomUUID()), file, {
        // The store is private: the file is unreachable without this app's
        // credentials, so it's read back through /api/attachments/[id].
        access: "private",
        handleUploadUrl: "/api/attachments/upload",
        // Tells the route which task this is for; it verifies the task is ours.
        clientPayload: taskId,
        contentType: file.type,
      });
      return addAttachmentAction(taskId, {
        url: blob.url,
        pathname: blob.pathname,
        name: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: attachmentKeys.task(taskId) }),
  });
}

export function useDeleteAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> => deleteAttachmentAction(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: attachmentKeys.task(taskId) });
      const prev = qc.getQueryData<TaskAttachment[]>(attachmentKeys.task(taskId));
      qc.setQueryData<TaskAttachment[]>(attachmentKeys.task(taskId), (old = []) =>
        old.filter((a) => a.id !== id),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(attachmentKeys.task(taskId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: attachmentKeys.task(taskId) }),
  });
}
