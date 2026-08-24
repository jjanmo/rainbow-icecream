import { tossPriceResponseSchema } from "./schema";
import { readRateLimitRemaining, tossAuthedFetch } from "./tossAuth";
import type { PriceLookup, PriceProvider } from "./priceProvider";

// GET /api/v1/prices?symbols=... accepts up to 200 comma-separated symbols per call.
const BATCH_SIZE = 200;

/** Toss's `currency` field is documented as present, but fall back to
 * inferring from the symbol shape (KRX codes are all-digit) if it's ever missing. */
function inferCurrency(symbol: string, currency: string | null | undefined): string {
  if (currency) return currency;
  return /^\d+$/.test(symbol) ? "KRW" : "USD";
}

export const tossPriceProvider: PriceProvider = {
  async getPrices(symbols) {
    const result: Record<string, PriceLookup> = {};
    let rateLimitRemaining: number | undefined;
    if (symbols.length === 0) return { prices: result };

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const path = `/api/v1/prices?symbols=${encodeURIComponent(batch.join(","))}`;
      const res = await tossAuthedFetch(path);
      rateLimitRemaining = readRateLimitRemaining(res.headers) ?? rateLimitRemaining;

      if (!res.ok) {
        const message = `${res.status} ${await res.text().catch(() => "")}`.trim();
        batch.forEach((symbol) => {
          result[symbol] = { error: message };
        });
        continue;
      }

      const json = await res.json();
      const parsed = tossPriceResponseSchema.safeParse(json);
      if (!parsed.success) {
        console.error("Unexpected Toss /api/v1/prices response shape", json);
        batch.forEach((symbol) => {
          result[symbol] = { error: "예상치 못한 응답 형식" };
        });
        continue;
      }

      const bySymbol = new Map(parsed.data.result.map((p) => [p.symbol, p]));
      batch.forEach((symbol) => {
        const priceRow = bySymbol.get(symbol);
        if (!priceRow) {
          result[symbol] = { error: "시세를 찾을 수 없음" };
          return;
        }
        const price = Number(priceRow.lastPrice);
        if (Number.isNaN(price)) {
          result[symbol] = { error: "가격 파싱 실패" };
          return;
        }
        result[symbol] = { price, currency: inferCurrency(symbol, priceRow.currency) };
      });
    }

    return { prices: result, rateLimitRemaining };
  },
};
