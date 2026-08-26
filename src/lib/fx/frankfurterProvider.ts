import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCachedFxRates, upsertFxRates } from "@/lib/api/fxRateCache";
import { frankfurterTimeSeriesSchema } from "./schema";

const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1";
const MS_PER_DAY = 86_400_000;

/** 연휴 등 긴 휴장에도 직전 영업일 환율을 찾을 수 있도록 요청 구간 앞에 붙이는 여유. */
const LOOKBACK_BUFFER_DAYS = 7;

function toUtcMs(dateKey: string): number {
  return Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1, Number(dateKey.slice(8, 10)));
}

function toDateKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDays(dateKey: string, days: number): string {
  return toDateKey(toUtcMs(dateKey) + days * MS_PER_DAY);
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const endMs = toUtcMs(end);
  for (let cursor = start; toUtcMs(cursor) <= endMs; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

/** sparse(영업일만 있는) 환율 맵을 [start, end] 전 구간에 순방향으로 채운다 —
 * 휴장일은 직전 영업일 값을 그대로 쓴다. */
function forwardFill(
  sparse: Record<string, number>,
  bufferedStart: string,
  start: string,
  end: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  let lastKnown: number | undefined;
  const endMs = toUtcMs(end);
  const startMs = toUtcMs(start);
  for (let cursor = bufferedStart; toUtcMs(cursor) <= endMs; cursor = addDays(cursor, 1)) {
    const rate = sparse[cursor];
    if (rate !== undefined) lastKnown = rate;
    if (toUtcMs(cursor) >= startMs && lastKnown !== undefined) {
      result[cursor] = lastKnown;
    }
  }
  return result;
}

/** Frankfurter에서 [bufferedStart, end] 구간의 실제 영업일 환율만(sparse, 주말/휴장일
 * 없음) 받아온다 — forward-fill은 호출부 책임. */
async function fetchFrankfurterSparse(bufferedStart: string, end: string): Promise<Record<string, number>> {
  const url = `${FRANKFURTER_BASE_URL}/${bufferedStart}..${end}?base=USD&symbols=KRW`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Frankfurter 환율 조회 실패: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const parsed = frankfurterTimeSeriesSchema.safeParse(json);
  if (!parsed.success) {
    console.error("Unexpected Frankfurter response shape", json);
    throw new Error("예상치 못한 Frankfurter 응답 형식");
  }

  const sparse: Record<string, number> = {};
  for (const [date, rates] of Object.entries(parsed.data.rates)) {
    if (rates.KRW !== undefined) sparse[date] = rates.KRW;
  }
  return sparse;
}

/**
 * [start, end] 구간의 날짜별 USD→KRW 환율. `fx_rate_daily` DB 캐시(ADR-0055)를
 * 먼저 읽고, 캐시에 없는 날짜가 하나라도 있을 때만 Frankfurter를 호출해 그
 * 결과를 캐시에 저장한다 — 과거 환율은 한 번 확정되면 절대 안 바뀌므로, 같은
 * 날짜를 두 번 API로 조회할 일이 없다(매매일지에서만 쓰인다 — 평가금액의 실시간
 * 환율은 이 캐시 대상이 아니다, ADR-0055).
 *
 * Frankfurter는 주말/휴장일 시세가 아예 빠져 있으므로, 직전 영업일 값을 순방향
 * 으로 채워 구간의 모든 날짜에 값을 채운다. 시작일 근처가 휴장으로 시작하는
 * 경우를 대비해 조회 구간 앞에 LOOKBACK_BUFFER_DAYS 만큼 여유를 두고 요청한다.
 */
export async function getUsdKrwHistoricalRates(
  supabase: SupabaseClient,
  start: string,
  end: string,
): Promise<Record<string, number>> {
  const bufferedStart = addDays(start, -LOOKBACK_BUFFER_DAYS);

  const cached = await fetchCachedFxRates(supabase, bufferedStart, end);
  let result = forwardFill(cached, bufferedStart, start, end);

  const hasGap = enumerateDates(start, end).some((d) => result[d] === undefined);
  if (hasGap) {
    const fresh = await fetchFrankfurterSparse(bufferedStart, end);
    await upsertFxRates(supabase, fresh);
    result = forwardFill({ ...fresh, ...cached }, bufferedStart, start, end);
  }

  return result;
}
