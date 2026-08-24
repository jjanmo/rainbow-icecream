import { tossCandlePageResponseSchema } from "./schema";
import { tossAuthedFetch } from "./tossAuth";

export type DailyChangeLookup = { changePct: number } | { error: string };

export interface DailyChangeResult {
  changes: Record<string, DailyChangeLookup>;
}

// /api/v1/candles는 prices와 달리 심볼 하나당 1건씩만 조회된다(콤마 배치 불가). 실측 결과
// MARKET_DATA_CHART 레이트리밋은 초당 20건(2026-08-23 응답 헤더로 확인)인데, 이건 "동시에
// 떠 있는 요청 수"가 아니라 "1초당 요청 수" 한도라 — 응답이 빨리 오면 동시성 캡(예전엔
// Promise.all 워커 풀 8개)만으로는 순식간에 초당 20건을 넘겨 실제로 rate-limit-exceeded가
// 났다. 그래서 배치를 창(window) 단위로 끊고, 한 창이 WINDOW_MS보다 빨리 끝나면 나머지를
// 재워서 초당 요청 수를 강제로 제한한다.
const REQUESTS_PER_WINDOW = 12; // 실측 20/sec보다 여유를 둔 값 — 다른 동시 사용자와 쿼터를 공유할 수 있어 보수적으로 잡았다.
const WINDOW_MS = 1000;
const MAX_RETRIES_ON_429 = 2;
const RETRY_BACKOFF_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOne(symbol: string): Promise<DailyChangeLookup> {
  for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt++) {
    try {
      const path = `/api/v1/candles?symbol=${encodeURIComponent(symbol)}&interval=1d&count=2`;
      const res = await tossAuthedFetch(path);
      if (res.status === 429 && attempt < MAX_RETRIES_ON_429) {
        await sleep(RETRY_BACKOFF_MS * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        return { error: `${res.status} ${await res.text().catch(() => "")}`.trim() };
      }
      const json = await res.json();
      const parsed = tossCandlePageResponseSchema.safeParse(json);
      if (!parsed.success || parsed.data.result.candles.length < 2) {
        return { error: "전일 종가를 찾을 수 없음" };
      }
      const [latest, previous] = parsed.data.result.candles;
      const latestClose = Number(latest.closePrice);
      const previousClose = Number(previous.closePrice);
      if (!Number.isFinite(latestClose) || !Number.isFinite(previousClose) || previousClose === 0) {
        return { error: "가격 파싱 실패" };
      }
      return { changePct: ((latestClose - previousClose) / previousClose) * 100 };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "요청 실패" };
    }
  }
  return { error: "요청 한도를 초과했습니다." };
}

/** 최신 일봉 종가를 전일 일봉 종가와 비교해 등락률(%)을 구한다. 장중이면 최신 봉이
 * 그날 진행 중인 가격이라 "현재가 대비 전일 종가"가 되고, 장 마감 후면 그날 확정 종가가
 * 되므로 — 국내/해외 시차에 따른 별도 분기 없이 항상 "그 시점의 등락률"이 나온다. */
export const tossCandleProvider = {
  async getDailyChanges(symbols: string[]): Promise<DailyChangeResult> {
    const changes: Record<string, DailyChangeLookup> = {};
    if (symbols.length === 0) return { changes };

    for (let i = 0; i < symbols.length; i += REQUESTS_PER_WINDOW) {
      const batch = symbols.slice(i, i + REQUESTS_PER_WINDOW);
      const windowStart = Date.now();
      const results = await Promise.all(batch.map((symbol) => fetchOne(symbol)));
      batch.forEach((symbol, idx) => {
        changes[symbol] = results[idx];
      });

      const hasMore = i + REQUESTS_PER_WINDOW < symbols.length;
      const elapsed = Date.now() - windowStart;
      if (hasMore && elapsed < WINDOW_MS) {
        await sleep(WINDOW_MS - elapsed);
      }
    }
    return { changes };
  },
};
