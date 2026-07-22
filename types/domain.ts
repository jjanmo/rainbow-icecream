export type Region = "국내" | "해외";
export type Currency = "KRW" | "USD";

export interface AssetGroup {
  id: string;
  userId: string;
  name: string;
  targetPct: number;
  flavorIndex: number;
  createdAt: string;
}

export interface Holding {
  id: string;
  userId: string;
  groupId: string;
  ticker: string | null;
  name: string;
  targetPctInGroup: number;
  qty: number;
  /** Always KRW, regardless of region — the price the user paid, in KRW terms. */
  avgPrice: number;
  account: string | null;
  region: Region;
  memo: string | null;
  createdAt: string;
}

/** A live price fetched from Toss, in the security's native currency. Never persisted. */
export interface LivePrice {
  price: number;
  currency: Currency;
}

/** Keyed by ticker. */
export type LivePriceMap = Record<string, LivePrice>;

export type NewAssetGroup = Omit<AssetGroup, "id" | "userId" | "createdAt">;
export type NewHolding = Omit<Holding, "id" | "userId" | "createdAt">;
