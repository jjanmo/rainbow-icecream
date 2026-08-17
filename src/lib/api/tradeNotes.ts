import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExitReason, NewTradeNote, NoteTargetType, TradeNote } from "@/types/journal";

interface TradeNoteRow {
  id: string;
  user_id: string;
  target_type: NoteTargetType;
  target_key: string;
  setup_tags: string[];
  emotion_tags: string[];
  exit_reason: ExitReason | null;
  followed_plan: boolean | null;
  invalidation_condition: string | null;
  stop_price: number | null;
  target_price: number | null;
  body: string | null;
  created_at: string;
}

const COLUMNS =
  "id, user_id, target_type, target_key, setup_tags, emotion_tags, exit_reason, followed_plan, invalidation_condition, stop_price, target_price, body, created_at";

function toDomain(row: TradeNoteRow): TradeNote {
  return {
    id: row.id,
    userId: row.user_id,
    targetType: row.target_type,
    targetKey: row.target_key,
    setupTags: row.setup_tags,
    emotionTags: row.emotion_tags,
    exitReason: row.exit_reason,
    followedPlan: row.followed_plan,
    invalidationCondition: row.invalidation_condition,
    stopPrice: row.stop_price == null ? null : Number(row.stop_price),
    targetPrice: row.target_price == null ? null : Number(row.target_price),
    body: row.body,
    createdAt: row.created_at,
  };
}

function toRow(note: NewTradeNote) {
  return {
    target_type: note.targetType,
    target_key: note.targetKey,
    setup_tags: note.setupTags,
    emotion_tags: note.emotionTags,
    exit_reason: note.exitReason,
    followed_plan: note.followedPlan,
    invalidation_condition: note.invalidationCondition,
    stop_price: note.stopPrice,
    target_price: note.targetPrice,
    body: note.body,
  };
}

/** 전량 조회 — 태그 자동완성 후보를 클라이언트에서 파생하려면 전체가 필요하다
 * (holdings.tsx의 accountOptions 파생과 같은 패턴). RLS가 이미 user로 스코핑한다. */
export async function fetchTradeNotes(supabase: SupabaseClient): Promise<TradeNote[]> {
  const { data, error } = await supabase.from("trade_notes").select(COLUMNS);
  if (error) throw error;
  return (data as TradeNoteRow[]).map(toDomain);
}

/**
 * 생성/수정을 하나로 처리한다 — `trade_notes_target_idx`(user_id, target_type,
 * target_key) 유니크 인덱스가 conflict target이다. POSITION 노트는 재수정이
 * 흔하므로(청산조건 갱신 등) 별도 update 분기를 두지 않는다.
 */
export async function upsertTradeNote(
  supabase: SupabaseClient,
  note: NewTradeNote,
): Promise<TradeNote> {
  const { data, error } = await supabase
    .from("trade_notes")
    .upsert(toRow(note), { onConflict: "user_id,target_type,target_key" })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toDomain(data as TradeNoteRow);
}
