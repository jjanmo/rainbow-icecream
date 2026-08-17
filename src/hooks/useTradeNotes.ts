import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTradeNotes, upsertTradeNote } from "@/lib/api/tradeNotes";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NewTradeNote } from "@/types/journal";

export const tradeNotesQueryKey = ["tradeNotes"] as const;

export function useTradeNotes() {
  return useQuery({
    queryKey: tradeNotesQueryKey,
    queryFn: () => fetchTradeNotes(getSupabaseBrowserClient()),
  });
}

export function useUpsertTradeNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: NewTradeNote) => upsertTradeNote(getSupabaseBrowserClient(), note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tradeNotesQueryKey }),
  });
}
