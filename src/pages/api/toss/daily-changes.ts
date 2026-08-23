import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tossCandleProvider } from "@/lib/toss/tossCandleProvider";
import type { DailyChangeLookup } from "@/lib/toss/tossCandleProvider";

interface SuccessBody {
  changes: Record<string, DailyChangeLookup>;
}
interface ErrorBody {
  error: string;
}

/**
 * 일일 등락률(전일 종가 대비) 조회 — /holdings 히트맵 뷰가 열려 있을 때만 호출된다.
 * prices와 달리 심볼 하나당 캔들 API 호출 1건이 필요해 비용이 더 크므로 상시 폴링(useLivePrices)과
 * 분리했다. 현재 시세와 마찬가지로 아무것도 DB에 쓰지 않는다.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessBody | ErrorBody>,
) {
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

  const symbols = Array.isArray(req.body?.symbols)
    ? req.body.symbols.filter((s: unknown): s is string => typeof s === "string" && s.length > 0)
    : [];

  if (symbols.length === 0) {
    return res.status(400).json({ error: "symbols is required" });
  }

  try {
    const { changes } = await tossCandleProvider.getDailyChanges(symbols);
    return res.status(200).json({ changes });
  } catch (err) {
    console.error("Toss daily change lookup failed", err);
    const message = err instanceof Error ? err.message : "Failed to fetch daily changes from Toss";
    return res.status(502).json({ error: message });
  }
}
