import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteHolding, fetchAllHoldings, fetchHoldings, insertHolding, updateHolding } from "@/lib/api/holdings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NewHolding } from "@/types/domain";

export const holdingsQueryKey = ["holdings"] as const;
export const allHoldingsQueryKey = ["holdings", "all"] as const;

export function useHoldings() {
  return useQuery({
    queryKey: holdingsQueryKey,
    queryFn: () => fetchHoldings(getSupabaseBrowserClient()),
  });
}

/** 삭제된 것까지 포함한 전체 종목 — 매매일지 전용(종목 모드 히스토리 조회). */
export function useAllHoldings() {
  return useQuery({
    queryKey: allHoldingsQueryKey,
    queryFn: () => fetchAllHoldings(getSupabaseBrowserClient()),
  });
}

function useInvalidateHoldings() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: holdingsQueryKey }),
      queryClient.invalidateQueries({ queryKey: allHoldingsQueryKey }),
    ]);
}

export function useAddHolding() {
  const invalidate = useInvalidateHoldings();
  return useMutation({
    mutationFn: (holding: NewHolding) => insertHolding(getSupabaseBrowserClient(), holding),
    onSuccess: invalidate,
  });
}

export function useUpdateHolding() {
  const invalidate = useInvalidateHoldings();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<NewHolding> }) =>
      updateHolding(getSupabaseBrowserClient(), id, patch),
    onSuccess: invalidate,
  });
}

/** 소프트 삭제 — executions/trade_notes는 그대로 남는다 (ADR-0045). */
export function useDeleteHolding() {
  const invalidate = useInvalidateHoldings();
  return useMutation({
    mutationFn: (id: string) => deleteHolding(getSupabaseBrowserClient(), id),
    onSuccess: invalidate,
  });
}
