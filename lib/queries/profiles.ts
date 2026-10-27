import { upload } from "@vercel/blob/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getHouseholdProfiles,
  getMyProfile,
  saveMyAvatar,
  updateMyProfile,
} from "@/lib/actions/profiles";
import { avatarPath } from "@/lib/avatars";
import type { ProfilePatch } from "./types";

export const profileKeys = {
  all: ["profiles"] as const,
  me: ["me"] as const,
};

/** All profiles in the household (for owner attribution: Lucas + Sofi). */
export function useProfiles() {
  return useQuery({
    queryKey: profileKeys.all,
    queryFn: () => getHouseholdProfiles(),
    staleTime: 5 * 60_000,
  });
}

/** The current signed-in user's profile. */
export function useMe() {
  return useQuery({
    queryKey: profileKeys.me,
    queryFn: () => getMyProfile(),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => updateMyProfile(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKeys.me });
      qc.invalidateQueries({ queryKey: profileKeys.all });
    },
  });
}

/**
 * Upload a profile photo, in two steps: the browser sends it straight to the
 * private Blob store (`/api/avatars/upload` authorises that), then the server
 * checks what was stored and points the profile at it.
 */
export function useUploadMyAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, userId }: { file: File; userId: string }): Promise<string> => {
      const blob = await upload(avatarPath(userId, file.name, crypto.randomUUID()), file, {
        // Read back through /api/avatars/[userId]; the store's URLs answer 403.
        access: "private",
        handleUploadUrl: "/api/avatars/upload",
        contentType: file.type,
      });
      return saveMyAvatar({ url: blob.url, pathname: blob.pathname });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKeys.me });
      qc.invalidateQueries({ queryKey: profileKeys.all });
    },
  });
}
