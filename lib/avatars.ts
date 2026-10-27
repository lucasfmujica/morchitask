/**
 * Rules for profile photos. Pure logic, shared by the upload route (which
 * enforces them), the Server Action (which re-checks what got stored), the read
 * route (which finds the file again) and the settings screen (which explains
 * them before you pick a file).
 *
 * Same shape as task attachments (see `lib/attachments.ts`): the browser
 * uploads straight to the private Blob store, and the app serves the photo back
 * through its own route, `/api/avatars/<userId>`.
 */

import { extensionOf } from "@/lib/attachments";

/** 5 MB — plenty for a phone photo that ends up rendered at 44 px. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Photos only: an avatar is rendered in an `<img>`, nothing else would show. */
export const AVATAR_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
];

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** The file part of an avatar's Blob key: `<uuid>` or `<uuid>.<ext>`. */
const FILE_NAME = new RegExp(`^${UUID}(\\.[a-z0-9]{1,12})?$`);

/** Blob keys live under their owner: `avatars/<userId>/<uuid>.<ext>`. */
export function avatarPrefix(userId: string): string {
  return `avatars/${userId}/`;
}

/** Where a given upload should be stored. A fresh id per upload, so a new
 *  photo never overwrites — or gets cached as — the old one. */
export function avatarPath(userId: string, fileName: string, uniqueId: string): string {
  const ext = extensionOf(fileName);
  return `${avatarPrefix(userId)}${uniqueId}${ext ? `.${ext}` : ""}`;
}

/**
 * True when `pathname` is one this app would have generated for this person.
 * The security boundary for the upload token: a path outside your own folder,
 * or one that smuggles a `/` or `..`, never gets one.
 */
export function isValidAvatarPath(pathname: string, userId: string): boolean {
  const prefix = avatarPrefix(userId);
  if (!userId || !pathname.startsWith(prefix)) return false;
  return FILE_NAME.test(pathname.slice(prefix.length));
}

export function isAllowedAvatarType(contentType: string): boolean {
  return AVATAR_CONTENT_TYPES.includes(contentType);
}

/**
 * What goes in `profiles.avatar_url` for an uploaded photo: the app's own read
 * route, with the file name as `v`. The `v` does two jobs — it changes on every
 * upload, so browsers never show a stale photo, and it is how the read route
 * finds the file again without a new database column.
 */
export function avatarSrc(userId: string, pathname: string): string {
  const file = pathname.slice(pathname.lastIndexOf("/") + 1);
  return `/api/avatars/${userId}?v=${encodeURIComponent(file)}`;
}

/**
 * The Blob key behind a stored `avatar_url`, or null when it isn't one of ours
 * (a Google photo, an old Supabase link, nothing at all).
 *
 * The read route calls this on the value from the database — not on the URL it
 * was requested with — so a crafted `?v=` can never point it at another file.
 */
export function avatarPathFromSrc(src: string | null | undefined, userId: string): string | null {
  if (!src || !userId) return null;
  let parsed: URL;
  try {
    parsed = new URL(src, "http://app.local");
  } catch {
    return null;
  }
  if (parsed.origin !== "http://app.local") return null;
  if (parsed.pathname !== `/api/avatars/${userId}`) return null;
  const file = parsed.searchParams.get("v") ?? "";
  const pathname = `${avatarPrefix(userId)}${file}`;
  return isValidAvatarPath(pathname, userId) ? pathname : null;
}

/** Why a photo can't be used, in words the person can act on — or null. */
export function avatarRejectionReason(file: { type: string; size: number }): string | null {
  if (!isAllowedAvatarType(file.type)) return "Elegí un archivo de imagen (foto).";
  if (file.size > MAX_AVATAR_BYTES) return "La imagen es muy pesada (máx. 5 MB).";
  if (file.size === 0) return "La imagen está vacía.";
  return null;
}
