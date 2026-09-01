import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteGroup, fetchGroups, insertGroup, updateGroup } from "@/lib/api/groups";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NewAssetGroup } from "@/types/domain";
import { allHoldingsQueryKey, holdingsQueryKey } from "./useHoldings";

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
      // 자산군을 지우면 소속 종목의 group_id가 null이 된다 (ADR-0059) — 활성/전체 둘 다 갱신.
      queryClient.invalidateQueries({ queryKey: holdingsQueryKey });
      queryClient.invalidateQueries({ queryKey: allHoldingsQueryKey });
    },
  });
}
