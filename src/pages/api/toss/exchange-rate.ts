import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUsdKrwRate } from "@/lib/toss/tossFxProvider";

interface SuccessBody {
  rate: number;
  rateLimitRemaining?: number;
}
interface ErrorBody {
  error: string;
}

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

  try {
    const { rate, rateLimitRemaining } = await getUsdKrwRate();
    return res.status(200).json({ rate, rateLimitRemaining });
  } catch (err) {
    console.error("Toss exchange-rate lookup failed", err);
    const message = err instanceof Error ? err.message : "Failed to fetch exchange rate from Toss";
    return res.status(502).json({ error: message });
  }
}
