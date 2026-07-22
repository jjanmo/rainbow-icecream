import { useQuery } from "@tanstack/react-query";

// FX moves slowly relative to stock prices — 1 minute is plenty.
const INTERVAL_MS = 60_000;

/** Used while the first live rate is still loading — FX moves slowly, so a
 * rough constant is a reasonable placeholder for a few seconds. */
export const DEFAULT_USD_KRW_RATE = 1400;

interface ExchangeRateResponse {
  rate: number;
  rateLimitRemaining?: number;
}

export function useExchangeRate() {
  return useQuery({
    queryKey: ["exchange-rate", "USD", "KRW"],
    queryFn: async (): Promise<ExchangeRateResponse> => {
      const res = await fetch("/api/toss/exchange-rate");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(body.error ?? "환율 조회에 실패했습니다.");
      }
      return res.json();
    },
    staleTime: 0,
    refetchInterval: INTERVAL_MS,
  });
}
