import type { SupabaseClient } from "@supabase/supabase-js";
import type { HoldingNote, HoldingNoteSide } from "@/types/journal";

interface HoldingNoteRow {
  id: string;
  user_id: string;
  identity_key: string;
  buy_memo: string | null;
  sell_memo: string | null;
  updated_at: string;
}

const COLUMNS = "id, user_id, identity_key, buy_memo, sell_memo, updated_at";

const SIDE_COLUMN: Record<HoldingNoteSide, "buy_memo" | "sell_memo"> = {
  buyMemo: "buy_memo",
  sellMemo: "sell_memo",
};

function toDomain(row: HoldingNoteRow): HoldingNote {
  return {
    id: row.id,
    userId: row.user_id,
    identityKey: row.identity_key,
    buyMemo: row.buy_memo,
    sellMemo: row.sell_memo,
    updatedAt: row.updated_at,
  };
}

/** 전량 조회 — RLS가 이미 user로 스코핑한다(종목 수만큼이라 작다). */
export async function fetchHoldingNotes(supabase: SupabaseClient): Promise<HoldingNote[]> {
  const { data, error } = await supabase.from("holding_notes").select(COLUMNS);
  if (error) throw error;
  return (data as HoldingNoteRow[]).map(toDomain);
}

/** 한쪽(매수/매도) 메모만 저장한다 — (user_id, identity_key) 유니크가 conflict target이라,
 * 행이 없으면 만들고 있으면 그 칸만 바꾼다(다른 쪽 메모는 건드리지 않는다). 빈 문자열은 null로
 * 저장해 "메모 없음"과 구분하지 않는다. */
export async function upsertHoldingNoteSide(
  supabase: SupabaseClient,
  identityKey: string,
  side: HoldingNoteSide,
  memo: string,
): Promise<void> {
  const trimmed = memo.trim();
  const { error } = await supabase
    .from("holding_notes")
    .upsert(
      { identity_key: identityKey, [SIDE_COLUMN[side]]: trimmed || null },
      { onConflict: "user_id,identity_key" },
    );
  if (error) throw error;
}
