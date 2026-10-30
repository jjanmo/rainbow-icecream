import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchHoldingNotes, upsertHoldingNoteSide } from "@/lib/api/holdingNotes";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { HoldingNoteSide } from "@/types/journal";

export const holdingNotesQueryKey = ["holdingNotes"] as const;

export function useHoldingNotes() {
  return useQuery({
    queryKey: holdingNotesQueryKey,
    queryFn: () => fetchHoldingNotes(getSupabaseBrowserClient()),
  });
}

export function useSaveHoldingNoteSide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { identityKey: string; side: HoldingNoteSide; memo: string }) =>
      upsertHoldingNoteSide(getSupabaseBrowserClient(), input.identityKey, input.side, input.memo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: holdingNotesQueryKey }),
  });
}
