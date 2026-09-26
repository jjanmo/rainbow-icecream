import type { Currency, Holding, LivePriceMap, Region } from "@/types/domain";
import { FLAVOR_HEXES } from "./color";

export const GOOD_COLOR = FLAVOR_HEXES[1]; // 민트

// Signed percentage-point diffs follow the Korean market convention users
// already read every day in their brokerage app: plus is red, minus is blue.
// (The inverse of the US green-up/red-down scheme — don't "fix" it.) The actual
// values are theme-aware CSS variables, defined in styles/globals.css: one
// fixed pair can't stay legible on both the near-white and the dark card.
const RISE_COLOR = "var(--diff-rise)"; // + : 실제가 목표보다 높음 → 매도 필요
const FALL_COLOR = "var(--diff-fall)"; // − : 실제가 목표보다 낮음 → 매수 필요

/** Loss red for 수익률 only — see returnColor. */
const LOSS_COLOR = "oklch(55% 0.16 25)";

/**
 * 종목의 실시간 평가/수익률 계산 결과 — 어느 탭·버킷에도 종속되지 않는다(ADR-0062).
 * 탭 기준 비중(목표%/실제%/차이)은 `computeAxisRebalance`(`axisRebalance.ts`)가
 * 이 값을 받아 탭별로 따로 계산한다.
 */
export interface HoldingCalc extends Holding {
  /** Price in the holding's native currency (KRW domestic, USD overseas). Falls
   * back to avgPrice (already in the holding's native currency) when no live
   * price is available. */
  priceNative: number;
  nativeCurrency: Currency;
  /** priceNative converted to KRW — this is what all aggregate math uses. */
  priceKrw: number;
  /** True only when a real Toss quote was available (not the avgPrice fallback). */
  hasLivePrice: boolean;
  /** qty * priceKrw — KRW valuation, used for totals/rebalance math. */
  value: number;
  /** qty * priceNative — informational only, shown for 해외 holdings. */
  valueNative: number;
  /** % of the whole portfolio this holding actually is, by current market value (KRW). */
  actualPct: number;
  returnPct: number;
}

export interface ResolvedHoldingValue {
  priceNative: number;
  nativeCurrency: Currency;
  priceKrw: number;
  hasLivePrice: boolean;
  value: number;
  valueNative: number;
}

/**
 * Resolves a holding's live price/valuation — the same fallback rules used
 * across the app (no live quote falls back to avgPrice, already in the
 * holding's own native currency), exposed standalone so un-saved draft
 * holdings on /portfolio can show a live 평가금 without needing a full
 * Holding row.
 */
export function resolveHoldingValueKrw(
  holding: { ticker: string | null; region: Region; avgPrice: number; qty: number },
  prices: LivePriceMap,
  usdKrwRate: number,
): ResolvedHoldingValue {
  const live = holding.ticker ? prices[holding.ticker] : undefined;
  const avgPriceCurrency: Currency = holding.region === "해외" ? "USD" : "KRW";
  const priceNative = live?.price ?? holding.avgPrice;
  const nativeCurrency: Currency = live?.currency ?? avgPriceCurrency;
  const priceKrw = nativeCurrency === "USD" ? priceNative * usdKrwRate : priceNative;
  return {
    priceNative,
    nativeCurrency,
    priceKrw,
    hasLivePrice: live !== undefined,
    value: holding.qty * priceKrw,
    valueNative: holding.qty * priceNative,
  };
}

function byCreatedThenId<T extends { createdAt: string; id: string }>(a: T, b: T) {
  const t = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (t !== 0) return t;
  return a.id.localeCompare(b.id);
}

export interface ComputeHoldingCalcsInput {
  holdings: Holding[];
  /** Live prices keyed by ticker — see hooks/useLivePrices.ts. */
  prices: LivePriceMap;
  /** USD→KRW — see hooks/useExchangeRate.ts. */
  usdKrwRate: number;
}

/**
 * 종목별 실시간 평가금·수익률만 계산한다(탭/버킷 개념 없음, ADR-0062) — 등록순으로
 * 정렬해 반환. 탭 기준 비중은 이 결과를 `computeAxisRebalance`에 넘겨서 별도로 낸다.
 */
export function computeHoldingCalcs({ holdings, prices, usdKrwRate }: ComputeHoldingCalcsInput): {
  holdings: HoldingCalc[];
  totalValue: number;
} {
  const holdingsStable = [...holdings].sort(byCreatedThenId);

  const resolvedPrices = new Map<string, ResolvedHoldingValue>();
  holdingsStable.forEach((h) => {
    resolvedPrices.set(h.id, resolveHoldingValueKrw(h, prices, usdKrwRate));
  });

  const totalValue = holdingsStable.reduce((sum, h) => sum + (resolvedPrices.get(h.id)?.value ?? 0), 0);

  const holdingsCalc: HoldingCalc[] = holdingsStable.map((h) => {
    const { priceNative, nativeCurrency, priceKrw, value, valueNative, hasLivePrice } = resolvedPrices.get(h.id)!;
    const actualPct = totalValue > 0 ? (value / totalValue) * 100 : 0;
    // Compared in the holding's own native currency (not priceKrw) so a
    // 해외 holding's return isn't distorted by FX movement since purchase —
    // avgPrice and priceNative are always in the same currency (see above).
    const returnPct = h.avgPrice > 0 ? ((priceNative - h.avgPrice) / h.avgPrice) * 100 : 0;

    return { ...h, priceNative, nativeCurrency, priceKrw, hasLivePrice, value, valueNative, actualPct, returnPct };
  });

  return { holdings: holdingsCalc, totalValue };
}

/**
 * Colors a signed diff by its sign alone. Plus means actual is above target
 * (매도 필요 방향), minus means actual is below target (매수 필요 방향) — the
 * sign/color alone carries that direction now (no separate 유지/매수 필요/매도
 * 필요 verdict label or threshold — that was scoped out when the standalone
 * 비중 체크 page was folded into /portfolio, see ADR-0056).
 */
export function diffColor(diff: number): string {
  if (diff === 0) return "var(--muted-foreground)";
  return diff > 0 ? RISE_COLOR : FALL_COLOR;
}

export function returnColor(returnPct: number): string {
  if (returnPct > 0) return GOOD_COLOR;
  if (returnPct < 0) return LOSS_COLOR;
  return "var(--muted-foreground)";
}
