import { useMemo } from "react";
import { computeRebalance } from "@/lib/calc/rebalance";
import { DEFAULT_USD_KRW_RATE, useExchangeRate } from "./useExchangeRate";
import { useGroups } from "./useGroups";
import { useHoldings } from "./useHoldings";
import { useLivePrices } from "./useLivePrices";

export function useRebalanceData() {
  const groupsQuery = useGroups();
  const holdingsQuery = useHoldings();

  const tickers = useMemo(
    () => (holdingsQuery.data ?? []).map((h) => h.ticker).filter((t): t is string => !!t),
    [holdingsQuery.data],
  );
  const pricesQuery = useLivePrices(tickers);
  const fxQuery = useExchangeRate();

  const result = useMemo(() => {
    if (!groupsQuery.data || !holdingsQuery.data) return undefined;
    return computeRebalance({
      groups: groupsQuery.data,
      holdings: holdingsQuery.data,
      prices: pricesQuery.data ?? {},
      usdKrwRate: fxQuery.data?.rate ?? DEFAULT_USD_KRW_RATE,
    });
  }, [groupsQuery.data, holdingsQuery.data, pricesQuery.data, fxQuery.data]);

  return {
    data: result,
    // Exposed so callers can resolve a live valuation for data that hasn't
    // gone through computeRebalance yet — e.g. /portfolio's unsaved draft
    // holdings (see lib/calc/rebalance.ts resolveHoldingValueKrw).
    prices: pricesQuery.data ?? {},
    usdKrwRate: fxQuery.data?.rate ?? DEFAULT_USD_KRW_RATE,
    // Price/FX loading or errors degrade gracefully (avgPrice fallback) rather
    // than blocking the page — only groups/holdings failures are fatal.
    isLoading: groupsQuery.isLoading || holdingsQuery.isLoading,
    isError: groupsQuery.isError || holdingsQuery.isError,
    error: groupsQuery.error ?? holdingsQuery.error,
  };
}
