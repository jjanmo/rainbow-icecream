import type { Currency, Region } from "@/types/domain";
import type { AssetType, Market, Side } from "@/types/journal";
import { resolveTaxRate } from "./taxRate";

/** 계좌별 요율이 등록되지 않았을 때 쓰는 기본 위탁수수료율. */
export const DEFAULT_DOMESTIC_FEE_RATE = 0.00015; // 0.015%
export const DEFAULT_OVERSEAS_FEE_RATE = 0.0007; // 0.07%

/**
 * 수량 정규화 — 소수점 거래 때문에 `0.1 + 0.2` 류의 잔여가 남으면 "보유 종목
 * 없음" 판정이 실패하고, 그 잔량에 단가가 곱해져 유령 평가금이 생긴다.
 * Decimal 라이브러리를 들이는 대신 8자리로 정관화하고 비교는 QTY_EPSILON 으로
 * 한다 (ADR-0030). 8자리는 해외 소수점 거래 정밀도보다 넉넉하다.
 */
const QTY_DECIMALS = 8;
export const QTY_EPSILON = 1e-8;

export function normalizeQty(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  return Number(qty.toFixed(QTY_DECIMALS));
}

export function isZeroQty(qty: number): boolean {
  return Math.abs(qty) < QTY_EPSILON;
}

/**
 * 통화별 반올림을 한 곳에 모은다. KRW 는 원 미만 절사(위탁수수료·증권거래세 모두
 * 통상 절사), USD 는 소수 둘째 자리 반올림.
 *
 * **절사 전에 반드시 정규화한다.** `700000 * 0.00015` 는 IEEE754 에서
 * `104.99999999999999` 이고, 그대로 `Math.floor` 하면 수수료가 105원이 아니라
 * 104원이 되어 취득원가가 1원 어긋난다(실제로 검증 시나리오에서 잡혔다).
 * 유효자리보다 훨씬 아래인 6자리에서 한 번 접어 표현 오차만 걷어낸다 —
 * Decimal 라이브러리를 들이지 않기로 한 결정(ADR-0030)의 대가를 여기서 지불한다.
 */
const ROUNDING_GUARD_DIGITS = 6;

export function roundCurrency(amount: number, currency: Currency): number {
  if (!Number.isFinite(amount)) return 0;
  const normalized = Number(amount.toFixed(ROUNDING_GUARD_DIGITS));
  if (currency === "KRW") return Math.floor(normalized);
  return Math.round(normalized * 100) / 100;
}

export function currencyOf(region: Region): Currency {
  return region === "해외" ? "USD" : "KRW";
}

export interface ExecutionCostInput {
  side: Side;
  qty: number;
  /** 종목의 원래 통화 기준 단가. */
  price: number;
  region: Region;
  market: Market;
  assetType: AssetType;
  /** ISO8601 */
  executedAt: string;
  domesticFeeRate?: number;
  overseasFeeRate?: number;
}

export interface ExecutionCost {
  /** 거래통화 기준 거래금액 (qty × price). */
  grossAmount: number;
  feeAmount: number;
  taxAmount: number;
  appliedFeeRate: number;
  appliedTaxRate: number;
  taxReason: string;
  /** 매수는 음수(현금 유출), 매도는 양수. 거래통화 기준. */
  netCashFlow: number;
  currency: Currency;
}

/**
 * 사용자는 수수료·세금을 입력하지 않는다. 요율 × 거래금액으로 계산한다 (ADR-0028).
 * 반드시 이 순서대로 — 반올림 시점이 바뀌면 증권사 청구액과 원 단위로 어긋난다.
 */
export function computeExecutionCost(input: ExecutionCostInput): ExecutionCost {
  const currency = currencyOf(input.region);
  const qty = normalizeQty(input.qty);
  const grossAmount = roundCurrency(qty * input.price, currency);

  const appliedFeeRate =
    currency === "KRW"
      ? (input.domesticFeeRate ?? DEFAULT_DOMESTIC_FEE_RATE)
      : (input.overseasFeeRate ?? DEFAULT_OVERSEAS_FEE_RATE);
  const feeAmount = roundCurrency(grossAmount * appliedFeeRate, currency);

  const tax = resolveTaxRate({
    market: input.market,
    assetType: input.assetType,
    side: input.side,
    executedAt: input.executedAt,
  });
  const taxAmount = roundCurrency(grossAmount * tax.rate, currency);

  const netCashFlow =
    input.side === "BUY" ? -(grossAmount + feeAmount) : grossAmount - feeAmount - taxAmount;

  return {
    grossAmount,
    feeAmount,
    taxAmount,
    appliedFeeRate,
    appliedTaxRate: tax.rate,
    taxReason: tax.reason,
    netCashFlow,
    currency,
  };
}
