import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchCachedHighs, insertHighs } from "@/lib/api/priceHighCache";
import { kstDateKey, tossHigh52wProvider, type High52w, type High52wLookup } from "@/lib/toss/tossHigh52wProvider";

interface SuccessBody {
  highs: Record<string, High52wLookup>;
}
interface ErrorBody {
  error: string;
}

/**
 * 종목별 52주 장중 고가 (ADR-0065). `price_high_52w` 캐시를 먼저 읽고, 오늘(KST) 값이 없는
 * 심볼만 Toss 캔들로 계산해 저장한다 — 그날 첫 조회만 비용이 들고 이후엔 DB 조회 한 번이다.
 * 조회에 실패한 심볼은 캐시하지 않는다(다음 요청에서 다시 시도).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<SuccessBody | ErrorBody>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = createSupabaseServerClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const symbols: string[] = Array.isArray(req.body?.symbols)
    ? [...new Set(req.body.symbols.filter((s: unknown): s is string => typeof s === "string" && s.length > 0))] as string[]
    : [];
  if (symbols.length === 0) {
    return res.status(400).json({ error: "symbols is required" });
  }

  try {
    const asOf = kstDateKey(Date.now());
    const cached = await fetchCachedHighs(supabase, symbols, asOf);
    const missing = symbols.filter((s) => !cached[s]);
    const fetched = missing.length > 0 ? await tossHigh52wProvider.getHighs(missing) : {};

    const fresh: Record<string, High52w> = {};
    for (const [symbol, lookup] of Object.entries(fetched)) {
      if ("highPrice" in lookup) fresh[symbol] = lookup;
    }
    // 캐시 저장 실패는 응답을 막지 않는다 — 다음 요청이 다시 계산할 뿐이다.
    await insertHighs(supabase, fresh, asOf).catch((err) => console.error("price_high_52w insert failed", err));

    return res.status(200).json({ highs: { ...fetched, ...cached } });
  } catch (err) {
    console.error("52-week high lookup failed", err);
    const message = err instanceof Error ? err.message : "Failed to fetch 52-week highs";
    return res.status(502).json({ error: message });
  }
}
