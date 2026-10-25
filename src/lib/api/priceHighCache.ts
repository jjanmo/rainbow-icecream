import type { SupabaseClient } from "@supabase/supabase-js";
import type { High52w } from "@/lib/toss/tossHigh52wProvider";

interface PriceHighRow {
  symbol: string;
  high_price: number;
  since_date: string;
  partial: boolean;
}

/** 그날(as_of, KST) 이미 계산해 둔 52주 고점을 읽는다 (ADR-0065). */
export async function fetchCachedHighs(
  supabase: SupabaseClient,
  symbols: string[],
  asOf: string,
): Promise<Record<string, High52w>> {
  const { data, error } = await supabase
    .from("price_high_52w")
    .select("symbol, high_price, since_date, partial")
    .eq("as_of", asOf)
    .in("symbol", symbols);
  if (error) throw error;

  const result: Record<string, High52w> = {};
  for (const row of data as PriceHighRow[]) {
    result[row.symbol] = { highPrice: Number(row.high_price), sinceDate: row.since_date, partial: row.partial };
  }
  return result;
}

/** 새로 계산한 52주 고점을 저장한다. 같은 날 다른 요청이 먼저 저장했으면 그냥 무시한다 —
 * fx_rate_daily와 같은 insert-only 캐시라 update 권한이 필요 없다. */
export async function insertHighs(
  supabase: SupabaseClient,
  highs: Record<string, High52w>,
  asOf: string,
): Promise<void> {
  const rows = Object.entries(highs).map(([symbol, h]) => ({
    symbol,
    as_of: asOf,
    high_price: h.highPrice,
    since_date: h.sinceDate,
    partial: h.partial,
  }));
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("price_high_52w")
    .upsert(rows, { onConflict: "symbol,as_of", ignoreDuplicates: true });
  if (error) throw error;
}
