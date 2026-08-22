import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewTradeNote, TradeNote } from "@/types/journal";

interface TradeNoteRow {
  id: string;
  user_id: string;
  execution_id: string;
  body: string | null;
  created_at: string;
}

const COLUMNS = "id, user_id, execution_id, body, created_at";

function toDomain(row: TradeNoteRow): TradeNote {
  return {
    id: row.id,
    userId: row.user_id,
    executionId: row.execution_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function toRow(note: NewTradeNote) {
  return {
    execution_id: note.executionId,
    body: note.body,
  };
}

/** 전량 조회 — RLS가 이미 user로 스코핑한다. */
export async function fetchTradeNotes(supabase: SupabaseClient): Promise<TradeNote[]> {
  const { data, error } = await supabase.from("trade_notes").select(COLUMNS);
  if (error) throw error;
  return (data as TradeNoteRow[]).map(toDomain);
}

/**
 * 생성/수정을 하나로 처리한다 — `trade_notes_execution_idx`(execution_id) 유니크
 * 인덱스가 conflict target이다. 체결 하나당 노트 하나라 (ADR-0043), 체결을
 * 수정할 때 근거를 다시 저장해도 같은 행이 갱신된다.
 */
export async function upsertTradeNote(
  supabase: SupabaseClient,
  note: NewTradeNote,
): Promise<TradeNote> {
  const { data, error } = await supabase
    .from("trade_notes")
    .upsert(toRow(note), { onConflict: "execution_id" })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toDomain(data as TradeNoteRow);
}
