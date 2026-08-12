/**
 * Rules for files attached to a task. Pure logic, shared by the upload route
 * (which enforces them), the Server Action (which re-checks what got stored)
 * and the UI (which explains them before you pick a file) — so a file the
 * screen accepts is exactly a file the server accepts.
 */

/** 10 MB — a phone photo is 2–5 MB, a scanned PDF rarely more. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * What can be attached: photos, PDFs, and the office/text documents a
 * household actually passes around (a quote, a lease, a spreadsheet).
 * Deliberately a list and not `*`: an upload token is a capability, and a
 * narrow one is easier to reason about than a wide one.
 */
export const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** Blob keys live under their task: `attachments/<taskId>/<uuid>.<ext>`.
 *  The browser uploads directly, so it is the browser that proposes this path
 *  — `isValidAttachmentPath` is what stops it from proposing someone else's. */
export function attachmentPrefix(taskId: string): string {
  return `attachments/${taskId}/`;
}

/** File extension, lowercased, without the dot — "" when the name has none. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  // A leading dot means a hidden file, not an extension.
  if (dot <= 0 || dot === fileName.length - 1) return "";
  return fileName
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
}

/**
 * Where a given upload should be stored. The random id is the whole file name:
 * the uploader's name for it is kept in the database instead, so a file called
 * "Estado de cuenta.pdf" doesn't put that title into a shareable URL.
 */
export function attachmentPath(taskId: string, fileName: string, uniqueId: string): string {
  const ext = extensionOf(fileName);
  return `${attachmentPrefix(taskId)}${uniqueId}${ext ? `.${ext}` : ""}`;
}

/**
 * True when `pathname` is one this app would have generated for this task.
 *
 * The check is the security boundary for client-side uploads: the token is
 * minted for whatever path the browser asks for, so a path that isn't inside
 * this task's folder — or that smuggles a `/` or `..` to climb out of it —
 * must never get one.
 */
export function isValidAttachmentPath(pathname: string, taskId: string): boolean {
  const prefix = attachmentPrefix(taskId);
  if (!pathname.startsWith(prefix)) return false;
  const rest = pathname.slice(prefix.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,12})?$/.test(
    rest,
  );
}

/**
 * True when `url` is a Vercel Blob URL, in this app's private store, for
 * exactly `pathname`.
 *
 * The browser reports the URL back after uploading, so without this the app
 * would store whatever link it was handed — including one pointing somewhere
 * else entirely. The host must be the *private* store: files here are only
 * readable with the store's credentials, which is why they are served through
 * `/api/attachments/[id]` instead of linked directly.
 */
export function isBlobUrlFor(url: string, pathname: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (!parsed.hostname.endsWith(".private.blob.vercel-storage.com")) return false;
  return decodeURIComponent(parsed.pathname) === `/${pathname}`;
}

/** Where the app reads an attachment from: its own route, which checks the
 *  session and streams the file out of the private store. */
export function attachmentSrc(id: string): string {
  return `/api/attachments/${id}`;
}

/** Whether the browser should display a file inline or download it. Images and
 *  PDFs have safe, built-in viewers; anything else is handed to the OS. */
export function isInlineViewable(contentType: string): boolean {
  return isImage(contentType) || contentType === "application/pdf";
}

/** Images get a thumbnail; everything else gets an icon and a name. */
export function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}

export function isAllowedType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.includes(contentType);
}

/** Size as a short human label: 900 → "900 B", 20480 → "20 KB", 5e6 → "4.8 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  // One decimal only while it's small enough for the decimal to mean something.
  return `${mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)} MB`;
}

/** Why a file can't be uploaded, in words the person can act on — or null. */
export function rejectionReason(file: { type: string; size: number }): string | null {
  if (!isAllowedType(file.type)) return "Ese tipo de archivo no se puede adjuntar.";
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `El archivo es muy pesado (máx. ${formatBytes(MAX_ATTACHMENT_BYTES)}).`;
  }
  if (file.size === 0) return "El archivo está vacío.";
  return null;
}
