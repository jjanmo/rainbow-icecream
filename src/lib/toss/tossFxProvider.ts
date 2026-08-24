import { tossExchangeRateResponseSchema } from "./schema";
import { readRateLimitRemaining, tossAuthedFetch } from "./tossAuth";

export interface FxLookup {
  rate: number;
  rateLimitRemaining?: number;
}

/** USD→KRW is the only pair this app needs (overseas holdings quote in USD). */
export async function getUsdKrwRate(): Promise<FxLookup> {
  const path = "/api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW";
  const res = await tossAuthedFetch(path);

  if (!res.ok) {
    throw new Error(`Toss exchange-rate request failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const parsed = tossExchangeRateResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error("Unexpected Toss /api/v1/exchange-rate response shape", json);
    throw new Error("예상치 못한 Toss 환율 응답 형식");
  }

  const rate = Number(parsed.data.result.rate);
  if (Number.isNaN(rate)) {
    throw new Error("환율 파싱 실패");
  }

  return { rate, rateLimitRemaining: readRateLimitRemaining(res.headers) };
}
