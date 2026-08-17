import type { Currency, Region } from "@/types/domain";
import type { Side } from "@/types/journal";

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
 * 통화별 반올림을 한 곳에 모은다. KRW 는 원 미만 절사, USD 는 소수 둘째 자리 반올림.
 *
 * **절사 전에 반드시 정규화한다.** IEEE754 표현 오차 때문에 곱셈 결과가
 * `104.99999999999999` 처럼 나올 수 있고, 그대로 `Math.floor` 하면 취득원가가
 * 원 단위로 어긋난다(실제로 검증 시나리오에서 잡혔다). 유효자리보다 훨씬 아래인
 * 6자리에서 한 번 접어 표현 오차만 걷어낸다 — Decimal 라이브러리를 들이지 않기로
 * 한 결정(ADR-0030)의 대가를 여기서 지불한다.
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

export interface ExecutionAmountInput {
  side: Side;
  qty: number;
  /** 종목의 원래 통화 기준 단가. */
  price: number;
  region: Region;
}

export interface ExecutionAmount {
  /** 거래통화 기준 거래금액 (qty × price). */
  grossAmount: number;
  /** 매수는 음수(현금 유출), 매도는 양수. 거래통화 기준. */
  netCashFlow: number;
  currency: Currency;
}

/**
 * 수수료·증권거래세는 계산하지 않는다 — 증권사·이벤트 할인율마다 달라 정밀 계산의
 * 실익이 낮다고 판단해 뺐다 (ADR-0034). 거래금액(qty × price)만 반올림 경계를
 * 거쳐 계산한다.
 */
export function computeExecutionAmount(input: ExecutionAmountInput): ExecutionAmount {
  const currency = currencyOf(input.region);
  const qty = normalizeQty(input.qty);
  const grossAmount = roundCurrency(qty * input.price, currency);
  const netCashFlow = input.side === "BUY" ? -grossAmount : grossAmount;
  return { grossAmount, netCashFlow, currency };
}
