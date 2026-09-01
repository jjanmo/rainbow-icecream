import type { ExposureRegion, MarketBucket, Region } from "@/types/domain";
import { colorFor, hueForGroupIndex } from "./color";
import type { HoldingCalc } from "./rebalance";

/** 실질 익스포저 지역의 기본값 — 상장 지역에서 파생(ADR-0058). 종목 등록 폼에서
 * 지역을 고르면 이 값으로 채우고, 현금·채권·원자재는 사용자가 "기타"(null)로 바꾼다. */
export function deriveExposureRegion(region: Region | ""): ExposureRegion | null {
  if (region === "해외") return "미국";
  if (region === "국내") return "한국";
  return null;
}

/**
 * 자산군 축(`computeRebalance`의 `GroupCalc`)을 일반화한 것 — "종목을 어느 버킷에
 * 넣느냐"(`bucketOf`)와 "목표%를 어디서 읽느냐"(`targets`)만 바꿔 시장 축을 같은
 * 계산식으로 굴린다 (ADR-0058). `diff`/`actionAmount`의 부호·색 규칙은 `GroupCalc`과
 * 동일하니 `diffColor`(`lib/calc/rebalance.ts`)를 그대로 재사용한다.
 */
export interface AxisBucketCalc {
  key: string;
  label: string;
  /** 위치 기반 파생색 — 자산군 색과 같은 로직(`hueForGroupIndex`). */
  color: string;
  members: HoldingCalc[];
  /** KRW 평가금 합계. */
  value: number;
  /** 축 집계 분모(측정 불가 제외분) 대비 실제 비중 %. */
  actualPct: number;
  targetPct: number;
  /** actualPct - targetPct. 양수 = 실제가 목표보다 높음(매도 방향). */
  diff: number;
  /** targetValue - actualValue (KRW). 양수 = 이만큼 매수. */
  actionAmount: number;
}

export interface AxisRebalanceResult {
  buckets: AxisBucketCalc[];
  /** 이 축 집계의 분모 — 측정 불가(`bucketOf`가 null)를 뺀 평가금 합. 시장 축은 전체와 같다. */
  includedValue: number;
  /** 축에서 제외된 평가금 합 (변동성 축의 "측정 불가"). 시장 축은 0. */
  excludedValue: number;
  excludedMembers: HoldingCalc[];
  /** 버킷 목표%의 합 — 완료 가드가 100%인지 검사한다. */
  targetSum: number;
}

export function computeAxisRebalance({
  holdings,
  buckets,
  bucketOf,
  targets,
}: {
  holdings: HoldingCalc[];
  buckets: { key: string; label: string }[];
  /** null이면 이 축에서 제외(측정 불가) — 분모에서도 빠진다. */
  bucketOf: (h: HoldingCalc) => string | null;
  targets: Record<string, number>;
}): AxisRebalanceResult {
  const byBucket = new Map<string, HoldingCalc[]>();
  const excludedMembers: HoldingCalc[] = [];

  holdings.forEach((h) => {
    const key = bucketOf(h);
    if (key === null) {
      excludedMembers.push(h);
      return;
    }
    const arr = byBucket.get(key) ?? [];
    arr.push(h);
    byBucket.set(key, arr);
  });

  const excludedValue = excludedMembers.reduce((sum, h) => sum + h.value, 0);
  const includedValue = holdings.reduce((sum, h) => sum + h.value, 0) - excludedValue;

  const bucketsCalc: AxisBucketCalc[] = buckets.map((b, index) => {
    const members = byBucket.get(b.key) ?? [];
    const value = members.reduce((sum, h) => sum + h.value, 0);
    const actualPct = includedValue > 0 ? (value / includedValue) * 100 : 0;
    const targetPct = targets[b.key] ?? 0;
    return {
      key: b.key,
      label: b.label,
      color: colorFor(hueForGroupIndex(index, buckets.length), 0),
      members,
      value,
      actualPct,
      targetPct,
      diff: actualPct - targetPct,
      actionAmount: (targetPct / 100) * includedValue - value,
    };
  });

  return {
    buckets: bucketsCalc,
    includedValue,
    excludedValue,
    excludedMembers,
    targetSum: buckets.reduce((sum, b) => sum + (targets[b.key] ?? 0), 0),
  };
}

// --- 시장 축 -------------------------------------------------------------

export const MARKET_BUCKETS: { key: MarketBucket; label: string }[] = [
  { key: "한국", label: "한국" },
  { key: "미국", label: "미국" },
  { key: "기타", label: "기타 (국가 무관)" },
];

/** `exposureRegion`이 null이면 "기타" 버킷으로 — 현금·채권·원자재 등 국가 익스포저가 아닌 자산. */
export function marketBucketOf(h: { exposureRegion: ExposureRegion | null }): MarketBucket {
  return h.exposureRegion ?? "기타";
}
