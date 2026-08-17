import type { Region } from "@/types/domain";
import type { AssetType, Market } from "@/types/journal";

export { defaultMarketFor } from "./taxRate";

export const DOMESTIC_MARKETS: Market[] = ["KOSPI", "KOSDAQ", "KONEX", "KOTC"];
export const OVERSEAS_MARKETS: Market[] = ["NASDAQ", "NYSE", "AMEX"];

export function marketsFor(region: Region): Market[] {
  return region === "해외" ? OVERSEAS_MARKETS : DOMESTIC_MARKETS;
}

export const ASSET_TYPES: AssetType[] = ["STOCK", "ETF", "ETN", "REIT", "FUND", "CASH"];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  STOCK: "개별주",
  ETF: "ETF",
  ETN: "ETN",
  REIT: "리츠",
  FUND: "펀드",
  CASH: "현금성",
};
