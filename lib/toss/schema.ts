import { z } from "zod";

// Confirmed empirically (2026-07-22) against the live API — every Toss Open
// API response wraps its payload in a `{ "result": ... }` envelope, which
// isn't obvious from the community-documented spec.

// GET /api/v1/prices
// timestamp/currency come back as `null` (not just absent) for symbols Toss
// can't actually price (e.g. a non-tradable placeholder ticker) — .nullish()
// so one bad item doesn't fail Zod's whole-array validation.
export const tossPriceSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  timestamp: z.string().nullish(),
  currency: z.string().nullish(),
});

export const tossPriceResponseSchema = z.object({
  result: z.array(tossPriceSchema),
});

export type TossPrice = z.infer<typeof tossPriceSchema>;

// GET /api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW
export const tossExchangeRateSchema = z.object({
  baseCurrency: z.string(),
  quoteCurrency: z.string(),
  rate: z.string(),
  rateChangeType: z.string().optional(),
});

export const tossExchangeRateResponseSchema = z.object({
  result: tossExchangeRateSchema,
});

export type TossExchangeRate = z.infer<typeof tossExchangeRateSchema>;
