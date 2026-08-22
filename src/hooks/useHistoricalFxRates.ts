import { useQuery } from "@tanstack/react-query";

interface HistoricalFxResponse {
  rates: Record<string, number>;
}

/**
 * 과거 날짜의 환율은 절대 바뀌지 않으므로 무기한 캐시한다 — useExchangeRate(현재
 * 환율, 1분마다 갱신)와는 정반대 캐시 전략이다.
 */
export function useHistoricalFxRates(start: string, end: string, enabled = true) {
  return useQuery({
    queryKey: ["fx-historical", start, end],
    queryFn: async (): Promise<HistoricalFxResponse> => {
      const res = await fetch(`/api/fx/historical-rates?start=${start}&end=${end}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(body.error ?? "과거 환율 조회에 실패했습니다.");
      }
      return res.json();
    },
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
