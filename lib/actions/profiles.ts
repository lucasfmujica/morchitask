"use server";

import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
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

/** Uploads a profile photo to Vercel Blob and points the profile at its URL.
 * Each upload gets a fresh name so the CDN never serves a stale image. */
export async function uploadMyAvatar(formData: FormData) {
  const { userId } = await requireSession();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("no file provided");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const blob = await put(`avatars/${userId}/${crypto.randomUUID()}.${ext}`, file, {
    access: "public",
    contentType: file.type,
  });

  await data.updateProfile(userId, { avatar_url: blob.url });
  return blob.url;
}
