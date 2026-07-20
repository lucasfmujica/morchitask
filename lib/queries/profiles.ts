import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getHouseholdProfiles,
  getMyProfile,
  updateMyProfile,
  uploadMyAvatar,
} from "@/lib/actions/profiles";
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

/** Upload a profile photo (Vercel Blob) and point the profile at its URL. */
export function useUploadMyAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File): Promise<string> => {
      const formData = new FormData();
      formData.set("file", file);
      return uploadMyAvatar(formData);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKeys.me });
      qc.invalidateQueries({ queryKey: profileKeys.all });
    },
  });
}
