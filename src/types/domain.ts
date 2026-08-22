export type Region = "국내" | "해외";
export type Currency = "KRW" | "USD";

/** 상품 자체의 고정된 분류 — 사용자가 설정하는 자산군(전략별 그룹, `AssetGroup`)과는
 * 별개다. 예: 삼성전자는 assetType="STOCK", 자산군은 사용자가 정한 "국내 성장주".
 * 변수명은 assetType이지만 화면에는 "자산종류"로 표시한다. */
export type AssetType = "STOCK" | "ETF" | "ETN" | "REIT" | "FUND" | "BOND" | "CASH";

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  STOCK: "개별 주식",
  ETF: "ETF",
  ETN: "ETN",
  REIT: "리츠",
  FUND: "일반 펀드",
  BOND: "채권",
  CASH: "예수금",
};

export interface AssetGroup {
  id: string;
  userId: string;
  name: string;
  targetPct: number;
  /** Manual display order (lower = earlier), set via drag-and-drop on /setup.
   * Also drives this group's color — see lib/calc/color.ts hueForGroupIndex —
   * color itself is never stored, only derived from position. */
  sortOrder: number;
  createdAt: string;
}

export interface Holding {
  id: string;
  userId: string;
  groupId: string;
  ticker: string | null;
  name: string;
  targetPctInGroup: number;
  /**
   * 체결 원장(`executions`)을 리플레이한 결과다 — 직접 쓰지 말고
   * `lib/journal/commit.ts`를 통해서만 갱신한다 (ADR-0027).
   */
  qty: number;
  /** In the holding's native currency: KRW for 국내, USD for 해외 (see `region`). */
  avgPrice: number;
  account: string | null;
  region: Region;
  assetType: AssetType;
  /** Manual display order within its group (lower = earlier), set via drag-and-drop on /setup. */
  sortOrder: number;
  /** soft delete — 하드 삭제는 executions/trade_notes까지 cascade로 영구히 지워서,
   * 나중에 같은 종목을 재매수했을 때 예전 기록을 다시 볼 방법이 없어진다 (ADR-0045). */
  deletedAt: string | null;
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
export type NewHolding = Omit<Holding, "id" | "userId" | "createdAt" | "deletedAt">;
