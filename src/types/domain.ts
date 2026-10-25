export type Region = "국내" | "해외";
export type Currency = "KRW" | "USD";

/** 실질 익스포저 지역 — 상장 시장·통화를 뜻하는 `region`과는 별개 개념이다.
 * KRX 상장 미국 ETF(예: TIGER 미국나스닥100)는 `region: "국내"`지만
 * `exposureRegion: "미국"`이다. `null`은 "특정 국가 익스포저가 아님"(현금·채권·
 * 원자재)을 뜻하고, 시장 축 비중 체크에서 "기타" 버킷으로 집계된다. ADR-0058. */
export type ExposureRegion = "한국" | "미국";

/** `/portfolio`의 축 전환(고정 2-way, ADR-0062) — 더 이상 유저가 만드는 임의 탭이 없다. */
export type PortfolioAxis = "role" | "market";

/** 시장 축의 버킷. `exposureRegion`이 null인 종목은 "기타"로 모인다. */
export type MarketBucket = ExposureRegion | "기타";

/** 역할·섹터 공통 축 종류. 역할(1차축, "왜 샀나")과 섹터(2차축, "무엇에 베팅했나")는
 * 이름/설명/목표%/순서라는 같은 모양의 데이터라 `AxisCategory` 하나로 통합했다
 * (ADR-0063) — `axis`만 다르다. 기준점이 다른 건 화면/계산 쪽에서 처리한다: 역할은
 * 총자산 기준 목표%(합계 100% 강제), 섹터는 소속 역할 내 목표%(강제 없음). 역할도
 * 섹터처럼 사용자가 계속 추가·삭제할 수 있다 — 더 이상 고정 enum이 아니다. */
export type AxisCategoryType = "role" | "sector";

export interface AxisCategory {
  id: string;
  userId: string;
  axis: AxisCategoryType;
  name: string;
  /** 선택, 최대 50자 — "이 축 카테고리가 뭘 뜻하는지"를 적어두는 메모. */
  description: string | null;
  targetPct: number;
  /** 관리 모달/역할 버킷 표시 순서. */
  sortOrder: number;
  createdAt: string;
}
export type NewAxisCategory = Omit<AxisCategory, "id" | "userId" | "createdAt">;

export const AXIS_CATEGORY_DESCRIPTION_MAX_LENGTH = 50;

/** 상품 자체의 고정된 분류 — 사용자가 정하는 역할/섹터와는 별개다. 예: 삼성전자는
 * assetType="STOCK", 역할은 "성장", 섹터는 "AI하드웨어". 변수명은 assetType이지만
 * 화면에는 "자산종류"로 표시한다. */
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

export interface Holding {
  id: string;
  userId: string;
  ticker: string | null;
  name: string;
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
  /** 역할(1차축) — "왜 샀나". `AxisCategory`(axis: "role") FK. null = 미분류(신규 종목은
   * 매매 시점에 채워지기 전까지 이 상태). ADR-0062/0063. */
  roleId: string | null;
  /** 섹터(2차축) — "무엇에 베팅하려고 샀나". `AxisCategory`(axis: "sector") FK. null = 미지정. ADR-0062. */
  sectorId: string | null;
  /** 기초자산 대비 배수 — 계산(비중/한도)엔 전혀 안 쓰는 순수 표시용 메타데이터. 기본 1. */
  leverage: number;
  // 매매 계획(ADR-0064) — 전부 선택 입력이라 null이면 "계획 없음"이고, 그 항목에 대한
  // 행 색상 신호도 뜨지 않는다. 금액은 지역과 무관하게 항상 원화다 — 해외 종목은
  // 투입 원가를 실시간 환율로 원화 환산해 비교한다(평가금액과 같은 성격, ADR-0038 경계 안).
  /** 정찰병 최대 금액 — 투입 원가가 이보다 작으면 "정찰병 미달". */
  scoutAmount: number | null;
  /** 최대 매수 금액 — 적립식(`isDca`)이거나 미정(`maxUndecided`)이면 null. */
  maxBuyAmount: number | null;
  /** 최대 매수 금액을 몇 번에 나눠 살지 — 적립식·미정이면 null. */
  splitCount: number | null;
  /** 적립식 — 최대 금액 대신 적립 일정(dca*)을 둔다. `maxUndecided`와 동시에 true일 수 없다. */
  isDca: boolean;
  /** 최대 금액 미정 — 상한 대신 매수 전략 메모(`undecidedMemo`)를 둔다. */
  maxUndecided: boolean;
  /** 최대 금액 미정일 때의 매수 전략 메모(자유 서술, 집계에 안 쓴다). */
  undecidedMemo: string | null;
  /** 적립 주기 — `isDca`일 때만 의미가 있다. null = 적립 일정 미정. */
  dcaFrequency: DcaFrequency | null;
  /** 적립일 — 매주면 요일(1=월 … 7=일), 매월이면 날짜(1~31), 매일이면 null. */
  dcaDay: number | null;
  /** 1회 적립 금액(원). `dcaQty`와 둘 중 하나만 채운다. */
  dcaAmount: number | null;
  /** 1회 적립 주수 — 해외 소수점 매수가 있어 소수 허용. `dcaAmount`와 둘 중 하나만. */
  dcaQty: number | null;
  /** 손절라인 수익률(%) — 항상 음수(예: -40). */
  stopLossPct: number | null;
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

export type NewHolding = Omit<Holding, "id" | "userId" | "createdAt" | "deletedAt">;

/** 적립식 주기 (ADR-0064). */
export type DcaFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export const DCA_FREQUENCY_LABELS: Record<DcaFrequency, string> = {
  DAILY: "매일",
  WEEKLY: "매주",
  MONTHLY: "매월",
};

/** 종목별 매매 계획 필드 묶음 (ADR-0064) — 입력 블록·저장 핸들러들이 같은 집합을 주고받는다. */
export type TradePlanKey =
  | "scoutAmount"
  | "maxBuyAmount"
  | "splitCount"
  | "isDca"
  | "maxUndecided"
  | "undecidedMemo"
  | "dcaFrequency"
  | "dcaDay"
  | "dcaAmount"
  | "dcaQty"
  | "stopLossPct";
export type TradePlan = Pick<Holding, TradePlanKey>;

/** 시장(실질지역) 축 버킷 하나에 대한 목표 비중 (ADR-0058). 역할·섹터는 이제
 * `AxisCategory.targetPct`에 직접 저장하므로 여기 안 들어간다(ADR-0063). */
export interface AxisTarget {
  axis: "market";
  bucket: string;
  targetPct: number;
}
