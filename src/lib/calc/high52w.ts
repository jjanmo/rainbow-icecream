import type { High52w } from "@/lib/toss/tossHigh52wProvider";

export interface Drawdown52w {
  /** 캐시된 52주 장중 고가와 실시간 현재가 중 큰 값 — 종목 통화 기준. */
  high: number;
  /** (현재가 ÷ 고점 − 1) × 100. 항상 0 이하. */
  drawdownPct: number;
  partial: boolean;
}

/** 52주 고점 대비 하락률 (ADR-0065). 캐시는 하루 한 번만 계산되므로, 그 뒤에 현재가가
 * 고점을 넘으면 현재가를 새 고점으로 본다. 시세가 없으면(현금성·조회 실패) 계산하지 않는다. */
export function drawdownFrom52wHigh(cached: High52w | undefined, price: number, hasLivePrice: boolean): Drawdown52w | null {
  if (!cached || !hasLivePrice || price <= 0) return null;
  const high = Math.max(cached.highPrice, price);
  return { high, drawdownPct: (price / high - 1) * 100, partial: cached.partial };
}
