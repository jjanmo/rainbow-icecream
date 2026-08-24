import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchExecutions } from "@/lib/api/executions";
import {
  commitExecutionDelete,
  commitExecutionUpdate,
  commitNewExecution,
} from "@/lib/journal/commit";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { allHoldingsQueryKey, holdingsQueryKey } from "./useHoldings";
import type { Holding } from "@/types/domain";
import type { NewExecution } from "@/types/journal";

export const executionsQueryKey = ["executions"] as const;

export function useExecutions() {
  return useQuery({
    queryKey: executionsQueryKey,
    queryFn: () => fetchExecutions(getSupabaseBrowserClient()),
  });
}

/**
 * 체결을 쓰면 보유 수량·평균매입가가 함께 바뀌고(ADR-0027), 전량 매도로 수량이
 * 0이 되면 deleted_at도 같이 바뀔 수 있으므로(commit.ts의 자동 삭제), executions·
 * holdings(활성)·holdings(전체) 캐시를 항상 같이 무효화한다. 하나만 갱신하면
 * 화면에서 원장과 포트폴리오가 어긋난 상태로 보인다.
 */
function useInvalidateJournal() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: executionsQueryKey }),
      queryClient.invalidateQueries({ queryKey: holdingsQueryKey }),
      queryClient.invalidateQueries({ queryKey: allHoldingsQueryKey }),
    ]);
}

export function useAddExecution() {
  const invalidate = useInvalidateJournal();
  return useMutation({
    mutationFn: ({ holding, execution }: { holding: Holding; execution: NewExecution }) =>
      commitNewExecution(getSupabaseBrowserClient(), holding, execution),
    onSuccess: invalidate,
  });
}

export function useUpdateExecution() {
  const invalidate = useInvalidateJournal();
  return useMutation({
    mutationFn: ({
      holding,
      id,
      patch,
    }: {
      holding: Holding;
      id: string;
      patch: Partial<NewExecution>;
    }) => commitExecutionUpdate(getSupabaseBrowserClient(), holding, id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteExecution() {
  const invalidate = useInvalidateJournal();
  return useMutation({
    mutationFn: ({ holding, id }: { holding: Holding; id: string }) =>
      commitExecutionDelete(getSupabaseBrowserClient(), holding, id),
    onSuccess: invalidate,
  });
}
