import { useQuery } from "@tanstack/react-query";
import type { High52w, High52wLookup } from "@/lib/toss/tossHigh52wProvider";

// 그날 첫 조회는 심볼당 캔들 2페이지라 서버 함수 하나가 오래 걸린다 — 요청을 나눠서
// 서버리스 함수 한 번이 처리하는 심볼 수를 제한한다(10개 ≈ 최대 30건 ≈ 3초).
const SYMBOLS_PER_REQUEST = 10;
// 52주 고점은 서버에서 하루 단위로 캐시되므로 자주 다시 물을 이유가 없다. 오늘 새로 생긴
// 고점은 화면에서 실시간 현재가와 max를 취해 반영한다(lib/calc/high52w.ts).
const STALE_MS = 60 * 60_000;

async function fetchChunk(symbols: string[]): Promise<Record<string, High52wLookup>> {
  const res = await fetch("/api/toss/high-52w", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? "52주 고점 조회에 실패했습니다.");
  }
  return (await res.json()).highs;
}

/** 종목별 52주 장중 고가(ADR-0065). 조회에 실패한 심볼은 결과 맵에 아예 없다 — 호출측이
 * "값 없음"으로 표시해야지 0%(고점과 같음)로 취급하면 안 된다. */
export function useHigh52w(tickers: string[]) {
  const sortedTickers = [...new Set(tickers)].sort();

  return useQuery({
    queryKey: ["high-52w", sortedTickers],
    queryFn: async (): Promise<Record<string, High52wLookup>> => {
      const merged: Record<string, High52wLookup> = {};
      for (let i = 0; i < sortedTickers.length; i += SYMBOLS_PER_REQUEST) {
        Object.assign(merged, await fetchChunk(sortedTickers.slice(i, i + SYMBOLS_PER_REQUEST)));
      }
      return merged;
    },
    enabled: sortedTickers.length > 0,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    select: (data): Record<string, High52w> => {
      const map: Record<string, High52w> = {};
      Object.entries(data).forEach(([symbol, lookup]) => {
        if ("highPrice" in lookup) map[symbol] = lookup;
      });
      return map;
    },
  });
}
