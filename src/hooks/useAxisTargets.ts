import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAxisTargets, saveAxisTargets } from "@/lib/api/axisTargets";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AxisTarget } from "@/types/domain";

export const axisTargetsQueryKey = ["axis-targets"] as const;

export function useAxisTargets() {
  return useQuery({
    queryKey: axisTargetsQueryKey,
    queryFn: () => fetchAxisTargets(getSupabaseBrowserClient()),
  });
}

export function useSaveAxisTargets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ axis, targets }: { axis: AxisTarget["axis"]; targets: Record<string, number> }) =>
      saveAxisTargets(getSupabaseBrowserClient(), axis, targets),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: axisTargetsQueryKey }),
  });
}

/** AxisTarget[] → { [bucket]: pct } (한 축만). 목표가 없는 버킷은 0. */
export function targetsByBucket(all: AxisTarget[] | undefined, axis: AxisTarget["axis"]): Record<string, number> {
  const map: Record<string, number> = {};
  (all ?? []).filter((t) => t.axis === axis).forEach((t) => {
    map[t.bucket] = t.targetPct;
  });
  return map;
}
