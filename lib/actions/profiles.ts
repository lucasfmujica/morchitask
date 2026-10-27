"use server";

import { isBlobUrlFor } from "@/lib/attachments";
import { auth } from "@/lib/auth";
import { avatarSrc, isValidAvatarPath } from "@/lib/avatars";
import * as data from "@/lib/db/queries/profiles";
import type { ProfilePatch } from "@/lib/queries/types";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId, userId: session.user.id };
}

export async function getMyProfile() {
  const session = await auth();
  if (!session?.user.id) return null;
  return data.getProfile(session.user.id);
}

export async function getHouseholdProfiles() {
  const { householdId } = await requireSession();
  return data.getHouseholdProfiles(householdId);
}

export async function updateMyProfile(patch: ProfilePatch) {
  const { userId } = await requireSession();
  return data.updateProfile(userId, patch);
}

/**
 * Point the profile at a photo the browser already uploaded to Blob.
 *
 * Everything here arrives from the client, so nothing is trusted: the path has
 * to be in the caller's own avatar folder and the URL has to be the private
 * store's URL for exactly that path. What gets saved is the app's own read
 * route (`/api/avatars/<userId>?v=…`), since the store's URLs answer 403.
 */
export async function saveMyAvatar(file: { url: string; pathname: string }) {
  const { userId } = await requireSession();
  if (!isValidAvatarPath(file.pathname, userId)) throw new Error("invalid path");
  if (!isBlobUrlFor(file.url, file.pathname)) throw new Error("invalid url");

  const src = avatarSrc(userId, file.pathname);
  await data.updateProfile(userId, { avatar_url: src });
  return src;
}
