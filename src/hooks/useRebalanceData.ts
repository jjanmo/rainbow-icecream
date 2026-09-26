import { useMemo } from "react";
import { computeHoldingCalcs } from "@/lib/calc/rebalance";
import { DEFAULT_USD_KRW_RATE, useExchangeRate } from "./useExchangeRate";
import { useHoldings } from "./useHoldings";
import { useLivePrices } from "./useLivePrices";

/**
 * 종목별 실시간 평가금·수익률(탭/버킷과 무관, ADR-0062)만 계산한다. 탭 기준 비중
 * (목표%/실제%/차이)이 필요한 화면은 이 결과의 `holdings`를 `computeAxisRebalance`에
 * 넘겨서 탭별로 따로 낸다 — `/portfolio`, `/holdings` 둘 다 이 훅 하나를 공유한다.
 */
export function useRebalanceData() {
  const holdingsQuery = useHoldings();

  const tickers = useMemo(
    () => (holdingsQuery.data ?? []).map((h) => h.ticker).filter((t): t is string => !!t),
    [holdingsQuery.data],
  );
  const pricesQuery = useLivePrices(tickers);
  const fxQuery = useExchangeRate();

  const result = useMemo(() => {
    if (!holdingsQuery.data) return undefined;
    return computeHoldingCalcs({
      holdings: holdingsQuery.data,
      prices: pricesQuery.data ?? {},
      usdKrwRate: fxQuery.data?.rate ?? DEFAULT_USD_KRW_RATE,
    });
  }, [holdingsQuery.data, pricesQuery.data, fxQuery.data]);

  return {
    data: result,
    // Exposed so callers can resolve a live valuation for data that hasn't
    // gone through computeHoldingCalcs yet — e.g. /portfolio's unsaved draft
    // holdings (see lib/calc/rebalance.ts resolveHoldingValueKrw).
    prices: pricesQuery.data ?? {},
    usdKrwRate: fxQuery.data?.rate ?? DEFAULT_USD_KRW_RATE,
    // Price/FX loading or errors degrade gracefully (avgPrice fallback) rather
    // than blocking the page — only a holdings-fetch failure is fatal.
    isLoading: holdingsQuery.isLoading,
    isError: holdingsQuery.isError,
    error: holdingsQuery.error,
  };
}
