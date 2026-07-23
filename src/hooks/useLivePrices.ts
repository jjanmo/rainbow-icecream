import { useQuery } from "@tanstack/react-query";
import type { PriceLookup } from "@/lib/toss/priceProvider";
import type { Currency, LivePriceMap } from "@/types/domain";

const BASE_INTERVAL_MS = 60_000;
const BACKOFF_INTERVAL_MS = 300_000;
const LOW_QUOTA_THRESHOLD = 5;

interface PricesResponse {
  prices: Record<string, PriceLookup>;
  rateLimitRemaining?: number;
}

function toCurrency(value: string): Currency {
  return value === "USD" ? "USD" : "KRW";
}

/**
 * Polls live prices for the given tickers. No WebSocket support on Toss's
 * side yet, so this is REST polling — 1min by default, backing off to 5min
 * when the (best-effort, header-derived) rate-limit quota runs low.
 */
export function useLivePrices(tickers: string[]) {
  const sortedTickers = [...new Set(tickers)].sort();

  return useQuery({
    queryKey: ["live-prices", sortedTickers],
    queryFn: async (): Promise<PricesResponse> => {
      const res = await fetch("/api/toss/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: sortedTickers }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(body.error ?? "시세 조회에 실패했습니다.");
      }
      return res.json();
    },
    enabled: sortedTickers.length > 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const remaining = query.state.data?.rateLimitRemaining;
      if (remaining !== undefined && remaining < LOW_QUOTA_THRESHOLD) return BACKOFF_INTERVAL_MS;
      return BASE_INTERVAL_MS;
    },
    select: (data): LivePriceMap => {
      const map: LivePriceMap = {};
      Object.entries(data.prices).forEach(([symbol, lookup]) => {
        if ("price" in lookup) {
          map[symbol] = { price: lookup.price, currency: toCurrency(lookup.currency) };
        }
      });
      return map;
    },
  });
}
