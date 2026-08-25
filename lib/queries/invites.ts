import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  inviteToHousehold,
  listInvites,
  revokeInvite as revokeInviteAction,
} from "@/lib/actions/invites";

export const inviteKeys = {
  all: ["invites"] as const,
};

export function useInvites() {
  return useQuery({
    queryKey: inviteKeys.all,
    queryFn: () => listInvites(),
  });
}

export function useInviteActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: inviteKeys.all });

  const invite = useMutation({
    mutationFn: (email: string) => inviteToHousehold(email),
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeInviteAction(id),
    onSuccess: invalidate,
  });

  return { invite, revoke };
}
