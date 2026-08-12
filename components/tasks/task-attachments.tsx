"use client";

import { useRef, useState } from "react";
import { FileText, ImageIcon, Loader2, Paperclip, Trash2 } from "lucide-react";
import {
  ALLOWED_CONTENT_TYPES,
  attachmentSrc,
  formatBytes,
  isImage,
  MAX_ATTACHMENT_BYTES,
  rejectionReason,
} from "@/lib/attachments";
import {
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
} from "@/lib/queries/attachments";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { cn } from "@/lib/utils";

/**
 * Files attached to a task: photos, PDFs, documents.
 *
 * Photos get a thumbnail because that's how you recognise them; everything else
 * gets its name, which is the only thing that identifies a PDF. Both open in a
 * new tab rather than in a viewer here — the phone's own viewer is better than
 * anything this sheet could show in 300 pixels.
 */
export function TaskAttachments({ taskId }: { taskId: string }) {
  const me = useMe().data;
  const profiles = useProfiles().data ?? [];
  const { data: files = [] } = useAttachments(taskId);
  const uploadFile = useUploadAttachment(taskId);
  const remove = useDeleteAttachment(taskId);

  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Names of what's in flight, so several files at once each show their own row.
  const [uploading, setUploading] = useState<string[]>([]);

  function send(list: FileList | File[]) {
    setError(null);
    for (const file of Array.from(list)) {
      const reason = rejectionReason(file);
      if (reason) {
        setError(`${file.name}: ${reason}`);
        continue;
      }
      setUploading((names) => [...names, file.name]);
      uploadFile.mutate(file, {
        onError: () => setError(`No se pudo subir ${file.name}. Probá de nuevo.`),
        // Drop this file's name whether it worked or not — the list below
        // either gained a row or the error line explains why it didn't.
        onSettled: () =>
          setUploading((names) => {
            const at = names.indexOf(file.name);
            return at === -1 ? names : [...names.slice(0, at), ...names.slice(at + 1)];
          }),
      });
    }
  }

  const nameOf = (userId: string) =>
    userId === me?.id ? "Vos" : (profiles.find((p) => p.id === userId)?.display_name ?? "Alguien");

  return (
    <div className="flex flex-col gap-2">
      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((f) => (
            <li key={f.id} className="group flex items-center gap-2.5">
              <a
                href={attachmentSrc(f.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border bg-surface p-1.5 transition-colors hover:bg-surface-2"
              >
                {isImage(f.content_type) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachmentSrc(f.id)}
                    alt={f.name}
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted">
                    <FileText className="h-4.5 w-4.5" aria-hidden />
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-fg">{f.name}</span>
                  <span className="text-2xs text-subtle">
                    {formatBytes(f.size_bytes)} · {nameOf(f.uploader_id)}
                  </span>
                </span>
              </a>
              {f.uploader_id === me?.id && (
                <button
                  onClick={() => remove.mutate(f.id)}
                  aria-label={`Eliminar ${f.name}`}
                  className="-m-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100 touch:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {uploading.map((name, i) => (
        <div
          key={`${name}-${i}`}
          className="flex items-center gap-2.5 rounded-lg border border-dashed border-border p-1.5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted">Subiendo {name}…</span>
        </div>
      ))}

      {/* Drop zone doubles as the button — one target, so on a phone it's a tap
          and on a desktop it's either a tap or a drag. */}
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) send(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm font-medium transition-colors",
          dragging
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted hover:bg-surface-2",
        )}
      >
        <Paperclip className="h-4 w-4" aria-hidden />
        {dragging ? "Soltá el archivo acá" : "Agregar archivo"}
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_CONTENT_TYPES.join(",")}
        onChange={(e) => {
          if (e.target.files?.length) send(e.target.files);
          // Reset so picking the same file twice in a row still fires onChange.
          e.target.value = "";
        }}
        className="hidden"
      />

      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : (
        files.length === 0 &&
        uploading.length === 0 && (
          <span className="flex items-center gap-1.5 text-2xs text-subtle">
            <ImageIcon className="h-3 w-3" aria-hidden />
            Fotos, PDFs o documentos, hasta {formatBytes(MAX_ATTACHMENT_BYTES)} cada uno.
          </span>
        )
      )}
    </div>
  );
}
