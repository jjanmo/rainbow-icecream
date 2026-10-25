import { tossCandlePageResponseSchema } from "./schema";
import { tossAuthedFetch } from "./tossAuth";

export interface High52w {
  /** 종목 통화(국내 KRW, 해외 USD) 기준 52주 장중 고가. */
  highPrice: number;
  /** 계산에 쓴 가장 오래된 일봉 날짜(KST, YYYY-MM-DD). */
  sinceDate: string;
  /** 상장 1년 미만 등으로 52주를 다 못 채웠다. */
  partial: boolean;
}

export type High52wLookup = High52w | { error: string };

const MS_PER_DAY = 86_400_000;
const WINDOW_DAYS = 364; // 52주
// /api/v1/candles count 최대가 200이라(ADR-0058 실측) 1년치(약 252 거래일)는 2페이지다.
// 휴장이 많은 해·데이터 이상에 대비해 3페이지에서 끊는다.
const PAGE_SIZE = 200;
const MAX_PAGES = 3;
// MARKET_DATA_CHART는 "초당 요청 수" 20건 한도(ADR-0058). 심볼마다 페이지를 순차로 받으므로
// tossCandleProvider처럼 심볼 묶음 단위 창으로는 실제 초당 요청 수를 못 묶는다 — 응답이
// 빠르면 한 창 안에서 페이지 요청이 계속 이어진다. 그래서 요청 하나하나가 슬롯을 받아야
// 나가는 슬라이딩 윈도우 리미터를 쓴다. 12는 tossCandleProvider와 같은 여유값.
const REQUESTS_PER_WINDOW = 12;
const WINDOW_MS = 1000;
const MAX_RETRIES_ON_429 = 2;
const RETRY_BACKOFF_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 최근 windowMs 안에 시작된 요청이 max건 미만일 때만 통과시킨다. JS는 단일 스레드라
 * 슬롯 확인과 예약(push) 사이에 끼어드는 요청이 없다. */
function createRateLimiter(max: number, windowMs: number) {
  const starts: number[] = [];
  return async function acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (starts.length > 0 && now - starts[0] >= windowMs) starts.shift();
      if (starts.length < max) {
        starts.push(now);
        return;
      }
      await sleep(windowMs - (now - starts[0]));
    }
  };
}

/** 타임스탬프 → KST 날짜 키. */
export function kstDateKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(ms));
}

async function fetchPage(symbol: string, before: string | null, acquire: () => Promise<void>) {
  const beforeParam = before ? `&before=${encodeURIComponent(before)}` : "";
  const path = `/api/v1/candles?symbol=${encodeURIComponent(symbol)}&interval=1d&count=${PAGE_SIZE}${beforeParam}`;
  for (let attempt = 0; ; attempt++) {
    await acquire();
    const res = await tossAuthedFetch(path);
    if (res.status === 429 && attempt < MAX_RETRIES_ON_429) {
      await sleep(RETRY_BACKOFF_MS * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.trim());
    const parsed = tossCandlePageResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("예상치 못한 캔들 응답 형식");
    return parsed.data.result;
  }
}

async function fetchOne(symbol: string, nowMs: number, acquire: () => Promise<void>): Promise<High52wLookup> {
  const cutoffMs = nowMs - WINDOW_DAYS * MS_PER_DAY;
  let highPrice = 0;
  let oldestMs = Infinity;
  let reachedCutoff = false;
  let before: string | null = null;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const { candles, nextBefore } = await fetchPage(symbol, before, acquire);
      for (const c of candles) {
        const ts = Date.parse(c.timestamp);
        if (!Number.isFinite(ts)) continue;
        if (ts < cutoffMs) {
          reachedCutoff = true;
          continue;
        }
        const high = Number(c.highPrice);
        if (Number.isFinite(high) && high > highPrice) highPrice = high;
        if (ts < oldestMs) oldestMs = ts;
      }
      if (reachedCutoff || !nextBefore || candles.length === 0) break;
      before = nextBefore;
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "요청 실패" };
  }
  if (highPrice <= 0 || !Number.isFinite(oldestMs)) return { error: "일봉 이력이 없음" };
  // 이력이 끝났는데(nextBefore 없음) 52주 전까지 못 갔으면 상장 1년 미만이다.
  return { highPrice, sinceDate: kstDateKey(oldestMs), partial: !reachedCutoff };
}

/** 심볼별 최근 52주 일봉 장중 고가의 최댓값. 최신 일봉(장중이면 진행 중인 오늘 봉)도
 * 포함한다 — 실제로 거래된 가격이라 "아직 최댓값이 아닐 수는 있어도 틀린 값"은 아니고,
 * 그 뒤의 상승분은 화면에서 실시간 현재가와 max를 취해 메운다. */
export const tossHigh52wProvider = {
  async getHighs(symbols: string[]): Promise<Record<string, High52wLookup>> {
    const nowMs = Date.now();
    const acquire = createRateLimiter(REQUESTS_PER_WINDOW, WINDOW_MS);
    const lookups = await Promise.all(symbols.map((s) => fetchOne(s, nowMs, acquire)));
    return Object.fromEntries(symbols.map((s, idx) => [s, lookups[idx]]));
  },
};
