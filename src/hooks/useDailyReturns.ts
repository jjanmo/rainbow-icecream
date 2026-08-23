import { useQuery } from "@tanstack/react-query";
import type { DailyChangeLookup } from "@/lib/toss/tossCandleProvider";

const POLL_INTERVAL_MS = 60_000;

interface DailyChangesResponse {
  changes: Record<string, DailyChangeLookup>;
}

/** 종목별 일일 등락률(전일 종가 대비 %) — /holdings 히트맵 뷰가 열려 있을 때만 폴링한다
 * (`enabled`). useLivePrices와 별도 쿼리인 이유는 lib/toss/tossCandleProvider.ts 참고 —
 * 캔들 API는 심볼당 별도 호출이 필요해 상시 폴링하기엔 비용이 더 크다. */
export function useDailyReturns(tickers: string[], enabled: boolean) {
  const sortedTickers = [...new Set(tickers)].sort();

  return useQuery({
    queryKey: ["daily-returns", sortedTickers],
    queryFn: async (): Promise<DailyChangesResponse> => {
      const res = await fetch("/api/toss/daily-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: sortedTickers }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(body.error ?? "일일 등락률 조회에 실패했습니다.");
      }
      return res.json();
    },
    enabled: enabled && sortedTickers.length > 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: enabled ? POLL_INTERVAL_MS : false,
    select: (data): Record<string, number> => {
      const map: Record<string, number> = {};
      Object.entries(data.changes).forEach(([symbol, lookup]) => {
        if ("changePct" in lookup) map[symbol] = lookup.changePct;
      });
      return map;
    },
  });
}
