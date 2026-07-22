export type PriceLookup = { price: number; currency: string } | { error: string };

export interface PriceLookupResult {
  prices: Record<string, PriceLookup>;
  /** Best-effort — undefined when Toss doesn't send a recognizable rate-limit header. */
  rateLimitRemaining?: number;
}

/** Isolates the price source behind an interface — the Toss adapter can be
 * swapped or stubbed without touching callers. */
export interface PriceProvider {
  getPrices(symbols: string[]): Promise<PriceLookupResult>;
}
