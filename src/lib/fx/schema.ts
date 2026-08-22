import { z } from "zod";

// GET https://api.frankfurter.dev/v1/{start}..{end}?base=USD&symbols=KRW
// 주말/휴장일은 rates에 아예 빠져 있다(ECB가 그 날 고시하지 않음) — 호출부에서
// 직전 영업일 값으로 순방향 채운다.
export const frankfurterTimeSeriesSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  rates: z.record(z.string(), z.object({ KRW: z.number() })),
});

export type FrankfurterTimeSeries = z.infer<typeof frankfurterTimeSeriesSchema>;
