import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tossPriceProvider } from "@/lib/toss/tossPriceProvider";
import type { PriceLookup } from "@/lib/toss/priceProvider";

interface SuccessBody {
  prices: Record<string, PriceLookup>;
  rateLimitRemaining?: number;
}
interface ErrorBody {
  error: string;
}

/**
 * Read-only live price lookup — called repeatedly by useLivePrices' polling,
 * never writes anything to the database (current price is never persisted).
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
    const { prices, rateLimitRemaining } = await tossPriceProvider.getPrices(symbols);
    return res.status(200).json({ prices, rateLimitRemaining });
  } catch (err) {
    console.error("Toss price lookup failed", err);
    const message = err instanceof Error ? err.message : "Failed to fetch prices from Toss";
    return res.status(502).json({ error: message });
  }
}
