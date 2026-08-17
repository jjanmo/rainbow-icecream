import type { AssetType, Market, Side } from "@/types/journal";
import type { Region } from "@/types/domain";

/**
 * 증권거래세 요율표. **날짜 기준 조회(effective-dated)** 다 — 과거 매매를 뒤늦게
 * 입력해도 그 시점의 요율이 적용되어야 한다 (ADR-0028).
 *
 * 원본 설계는 이 표를 DB 설정 테이블로 두라고 했지만(세법 개정 시 무배포 갱신),
 * 이 앱은 1인용이고 배포가 곧 갱신이라 그 이점이 크지 않다. 대신 코드에 두면
 * 요율 변경이 git 이력에 남아 "이 값이 왜 이랬는지"를 추적할 수 있다. 과거
 * 데이터를 지켜주는 쪽은 어차피 요율표가 아니라 체결 행의 스냅샷이다.
 *
 * 각 시장별로 effectiveFrom 내림차순 정렬을 유지할 것 — 조회가 이 순서를 가정한다.
 */
const TAX_RATES: Record<Market, { effectiveFrom: string; rate: number; note: string }[]> = {
  KOSPI: [
    { effectiveFrom: "2026-01-01", rate: 0.002, note: "증권거래세 0.05% + 농특세 0.15%" },
    { effectiveFrom: "2023-01-01", rate: 0.0015, note: "증권거래세 0% + 농특세 0.15%" },
  ],
  KOSDAQ: [
    { effectiveFrom: "2026-01-01", rate: 0.002, note: "증권거래세 0.20% (농특세 없음)" },
    { effectiveFrom: "2023-01-01", rate: 0.0015, note: "증권거래세 0.15%" },
  ],
  KONEX: [{ effectiveFrom: "1900-01-01", rate: 0.001, note: "증권거래세 0.10%" }],
  KOTC: [
    { effectiveFrom: "2026-01-01", rate: 0.002, note: "증권거래세 0.20%" },
    { effectiveFrom: "1900-01-01", rate: 0.0015, note: "증권거래세 0.15%" },
  ],
  // 미국 시장은 증권거래세가 없다. 매도 시 SEC fee 는 별도 항목이며 v1 비범위.
  NASDAQ: [{ effectiveFrom: "1900-01-01", rate: 0, note: "해당 없음" }],
  NYSE: [{ effectiveFrom: "1900-01-01", rate: 0, note: "해당 없음" }],
  AMEX: [{ effectiveFrom: "1900-01-01", rate: 0, note: "해당 없음" }],
};

/** market 이 비어 있는 기존 종목의 기본값. 국내는 KOSPI, 해외는 NASDAQ 로 본다. */
export function defaultMarketFor(region: Region): Market {
  return region === "해외" ? "NASDAQ" : "KOSPI";
}

export interface TaxRateLookup {
  market: Market;
  assetType: AssetType;
  side: Side;
  /** ISO8601 */
  executedAt: string;
}

export interface ResolvedTaxRate {
  rate: number;
  /** 왜 이 요율인지 — 화면의 배지 툴팁과 체결 상세에 그대로 보여준다. */
  reason: string;
}

/**
 * 매도 시에만 붙는다. 매수는 항상 0.
 *
 * **국내 상장 ETF는 매도 시 증권거래세가 면제된다.** 이용사가 편입 종목 매매
 * 단계에서 이미 납부하기 때문이다. 이 분기를 빠뜨리면 ETF 비중이 큰 계좌의
 * 수익이 체계적으로 과소 계산된다 — 원본 문서가 특히 강조한 지점이다.
 */
export function resolveTaxRate({ market, assetType, side, executedAt }: TaxRateLookup): ResolvedTaxRate {
  if (side === "BUY") return { rate: 0, reason: "매수는 증권거래세 없음" };

  const isDomestic = market === "KOSPI" || market === "KOSDAQ" || market === "KONEX" || market === "KOTC";
  if (isDomestic && assetType === "ETF") {
    return { rate: 0, reason: "국내 상장 ETF는 증권거래세 면제" };
  }
  if (assetType === "CASH") {
    return { rate: 0, reason: "현금성 자산은 해당 없음" };
  }

  const day = executedAt.slice(0, 10);
  const row = TAX_RATES[market].find((r) => r.effectiveFrom <= day);
  if (!row) return { rate: 0, reason: "적용 가능한 요율 없음" };
  return { rate: row.rate, reason: `${row.effectiveFrom} 이후 ${market} · ${row.note}` };
}
