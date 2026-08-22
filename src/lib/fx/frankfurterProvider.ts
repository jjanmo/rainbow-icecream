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

/**
 * [start, end] 구간의 날짜별 USD→KRW 환율. Frankfurter는 주말/휴장일 시세가
 * 아예 빠져 있으므로, 직전 영업일 값을 순방향으로 채워 구간의 모든 날짜에
 * 값을 채운다. 시작일 근처가 휴장으로 시작하는 경우를 대비해 조회 구간 앞에
 * LOOKBACK_BUFFER_DAYS 만큼 여유를 두고 요청한다.
 */
export async function getUsdKrwHistoricalRates(start: string, end: string): Promise<Record<string, number>> {
  const bufferedStart = addDays(start, -LOOKBACK_BUFFER_DAYS);
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

  const result: Record<string, number> = {};
  let lastKnown: number | undefined;
  const endMs = toUtcMs(end);
  const startMs = toUtcMs(start);
  for (let cursor = bufferedStart; toUtcMs(cursor) <= endMs; cursor = addDays(cursor, 1)) {
    const rate = parsed.data.rates[cursor]?.KRW;
    if (rate !== undefined) lastKnown = rate;
    if (toUtcMs(cursor) >= startMs && lastKnown !== undefined) {
      result[cursor] = lastKnown;
    }
  }
  return result;
}
