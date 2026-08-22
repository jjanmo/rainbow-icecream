import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteHolding, fetchHoldings, insertHolding, updateHolding } from "@/lib/api/holdings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NewHolding } from "@/types/domain";

export const holdingsQueryKey = ["holdings"] as const;

export function useHoldings() {
  return useQuery({
    queryKey: holdingsQueryKey,
    queryFn: () => fetchHoldings(getSupabaseBrowserClient()),
  });
}

export function useAddHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (holding: NewHolding) => insertHolding(getSupabaseBrowserClient(), holding),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: holdingsQueryKey }),
  });
}

export function useUpdateHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<NewHolding> }) =>
      updateHolding(getSupabaseBrowserClient(), id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: holdingsQueryKey }),
  });
}

/** 소프트 삭제 — executions/trade_notes는 그대로 남는다 (ADR-0045). */
export function useDeleteHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteHolding(getSupabaseBrowserClient(), id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: holdingsQueryKey }),
  });
}
