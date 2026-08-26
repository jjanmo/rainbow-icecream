import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUsdKrwHistoricalRates } from "@/lib/fx/frankfurterProvider";

interface SuccessBody {
  rates: Record<string, number>;
}
interface ErrorBody {
  error: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessBody | ErrorBody>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = createSupabaseServerClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { start, end } = req.query;
  if (typeof start !== "string" || typeof end !== "string" || !DATE_RE.test(start) || !DATE_RE.test(end)) {
    return res.status(400).json({ error: "start/end는 YYYY-MM-DD 형식이어야 합니다." });
  }

  try {
    const rates = await getUsdKrwHistoricalRates(supabase, start, end);
    return res.status(200).json({ rates });
  } catch (err) {
    console.error("Frankfurter historical rate lookup failed", err);
    const message = err instanceof Error ? err.message : "Failed to fetch historical exchange rates";
    return res.status(502).json({ error: message });
  }
}
