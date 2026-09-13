export type Region = "국내" | "해외";
export type Currency = "KRW" | "USD";

/** 실질 익스포저 지역 — 상장 시장·통화를 뜻하는 `region`과는 별개 개념이다.
 * KRX 상장 미국 ETF(예: TIGER 미국나스닥100)는 `region: "국내"`지만
 * `exposureRegion: "미국"`이다. `null`은 "특정 국가 익스포저가 아님"(현금·채권·
 * 원자재)을 뜻하고, 시장 축 비중 체크에서 "기타" 버킷으로 집계된다. ADR-0058. */
export type ExposureRegion = "한국" | "미국";

/** 비중 체크 축. `group`(사용자 자산군) / `market`(실질 익스포저 지역). ADR-0058.
 * 변동성 축은 분류 기준이 아직 안 정해져서 뺐다 — 재도입 시 여기에 추가. */
export type AllocationAxis = "group" | "market";

/** 시장 축의 버킷. `exposureRegion`이 null인 종목은 "기타"로 모인다. */
export type MarketBucket = ExposureRegion | "기타";

/** 상품 자체의 고정된 분류 — 사용자가 설정하는 자산군(전략별 그룹, `AssetGroup`)과는
 * 별개다. 예: 삼성전자는 assetType="STOCK", 자산군은 사용자가 정한 "국내 성장주".
 * 변수명은 assetType이지만 화면에는 "자산종류"로 표시한다. */
export type AssetType = "STOCK" | "ETF" | "ETN" | "FUND" | "BOND" | "GOLD" | "CASH";

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  STOCK: "개별주식",
  ETF: "ETF",
  ETN: "ETN",
  FUND: "펀드",
  BOND: "채권",
  GOLD: "금현물",
  CASH: "현금성",
};

export interface AssetGroup {
  id: string;
  userId: string;
  name: string;
  targetPct: number;
  /** Manual display order (lower = earlier), set via drag-and-drop on /portfolio.
   * Also drives this group's color — see lib/calc/color.ts hueForGroupIndex —
   * color itself is never stored, only derived from position. */
  sortOrder: number;
  createdAt: string;
}

export interface Holding {
  id: string;
  userId: string;
  /** null only for a soft-deleted holding whose group was later deleted —
   * `deleteGroup` (`lib/api/groups.ts`) nulls it out rather than pointing it
   * at some other real group it never actually belonged to (a live holding's
   * group_id is never null; that's enforced by app logic, not the DB type). */
  groupId: string | null;
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
  /** 실질 익스포저 지역 (ADR-0058). null = "국가 무관"(현금·채권·원자재) → 시장 축의 "기타" 버킷.
   * `region`과 다른 개념이니 혼동 주의 — `region`은 상장 시장·통화. */
  exposureRegion: ExposureRegion | null;
  /** Manual display order within its group (lower = earlier), set via drag-and-drop on /portfolio. */
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
/** groupId narrowed back to non-null — a holding is always created into a real
 * group; only `deleteGroup` nulls it out for an already-dead holding. */
export type NewHolding = Omit<Holding, "id" | "userId" | "createdAt" | "deletedAt" | "groupId"> & { groupId: string };

/** 시장/변동성 축의 버킷 하나에 대한 목표 비중 (ADR-0058). 자산군 축은 이걸
 * 안 쓰고 `asset_groups.target_pct`를 그대로 쓴다. */
export interface AxisTarget {
  axis: Exclude<AllocationAxis, "group">;
  bucket: string;
  targetPct: number;
}
