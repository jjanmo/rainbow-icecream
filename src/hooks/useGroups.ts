import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteGroup, fetchGroups, insertGroup, updateGroup } from "@/lib/api/groups";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NewAssetGroup } from "@/types/domain";
import { holdingsQueryKey } from "./useHoldings";

export const groupsQueryKey = ["groups"] as const;

export function useGroups() {
  return useQuery({
    queryKey: groupsQueryKey,
    queryFn: () => fetchGroups(getSupabaseBrowserClient()),
  });
}

export function useAddGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (group: NewAssetGroup) => insertGroup(getSupabaseBrowserClient(), group),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupsQueryKey }),
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<NewAssetGroup> }) =>
      updateGroup(getSupabaseBrowserClient(), id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupsQueryKey }),
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGroup(getSupabaseBrowserClient(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
      // deleting a group cascades to its holdings in the DB (on delete cascade)
      queryClient.invalidateQueries({ queryKey: holdingsQueryKey });
    },
  });
}
