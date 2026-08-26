import type { SupabaseClient } from "@supabase/supabase-js";

interface FxRateRow {
  rate_date: string;
  rate: number;
}

/** [start, end] 구간에 이미 캐시된 일별 환율(영업일만 존재하는 sparse map)을 읽는다. */
export async function fetchCachedFxRates(
  supabase: SupabaseClient,
  start: string,
  end: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("fx_rate_daily")
    .select("rate_date, rate")
    .gte("rate_date", start)
    .lte("rate_date", end);
  if (error) throw error;

  const result: Record<string, number> = {};
  for (const row of data as FxRateRow[]) {
    result[row.rate_date] = Number(row.rate);
  }
  return result;
}

/** 새로 알아낸 날짜별 환율을 캐시에 저장한다. 한 번 저장된 날짜의 값은 절대
 * 안 바뀌므로(ADR-0055), 충돌 시 그냥 무시한다 — 같은 값을 다시 쓰는 것뿐이라
 * update 권한 자체가 필요 없다(RLS에 insert 정책만 있는 이유). */
export async function upsertFxRates(supabase: SupabaseClient, rates: Record<string, number>): Promise<void> {
  const rows = Object.entries(rates).map(([rate_date, rate]) => ({ rate_date, rate }));
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("fx_rate_daily")
    .upsert(rows, { onConflict: "rate_date", ignoreDuplicates: true });
  if (error) throw error;
}
