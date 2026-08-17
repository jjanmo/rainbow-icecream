import type { AssetGroup, Currency, Holding, LivePriceMap, Region } from "@/types/domain";
import { colorFor, FLAVOR_HEXES, hueForGroupIndex, tintForIndex } from "./color";

/** Diff (percentage points) below which an asset group is considered "on target". */
export const REBALANCE_THRESHOLD = 5;

export const GOOD_COLOR = FLAVOR_HEXES[1]; // 민트
const OVER_TARGET_COLOR = "oklch(58% 0.13 75)"; // sell needed
const UNDER_TARGET_COLOR = "oklch(55% 0.16 25)"; // buy needed

/**
 * Note there is deliberately no per-holding target/diff/actionAmount here:
 * targets are only set at the asset-group level (there's no UI for a
 * holding's in-group target anymore), so comparing an individual holding
 * against a target would be comparing against a number nobody set. All
 * rebalance judgement happens on GroupCalc — see ADR-0024.
 */
export interface HoldingCalc extends Holding {
  color: string;
  groupName: string;
  groupColor: string;
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
  actualPctInGroup: number;
  returnPct: number;
}

export interface GroupCalc extends AssetGroup {
  hue: number;
  color: string;
  members: HoldingCalc[];
  value: number;
  actualPct: number;
  diff: number;
  /** Positive = sell this much, negative = buy this much (KRW), to reach target. */
  actionAmount: number;
}

export interface RebalanceResult {
  /** Display order (sort_order, created_at, id) — same as /setup shows. */
  groups: GroupCalc[];
  holdings: HoldingCalc[];
  totalValue: number;
  targetSum: number;
}

export interface ComputeRebalanceInput {
  groups: AssetGroup[];
  holdings: Holding[];
  /** Live prices keyed by ticker — see hooks/useLivePrices.ts. */
  prices: LivePriceMap;
  /** USD→KRW — see hooks/useExchangeRate.ts. */
  usdKrwRate: number;
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
 * Resolves a holding's live price/valuation — the same fallback rules
 * computeRebalance uses internally (no live quote falls back to avgPrice,
 * already in the holding's own native currency), exposed standalone so
 * un-saved draft holdings on /setup can show a live 평가금 without needing
 * a full Holding row (see EditHoldingInlineRow).
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

/** Manual order (drag-and-drop on /setup) first, falling back to creation
 * order for holdings that haven't been manually reordered yet. */
function byOrderThenCreatedThenId<T extends { sortOrder: number; createdAt: string; id: string }>(a: T, b: T) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return byCreatedThenId(a, b);
}

export function computeRebalance({
  groups,
  holdings,
  prices,
  usdKrwRate,
}: ComputeRebalanceInput): RebalanceResult {
  const sortedGroups = [...groups].sort(byOrderThenCreatedThenId);
  const groupById = new Map(sortedGroups.map((g) => [g.id, g]));
  const groupIndexById = new Map(sortedGroups.map((g, i) => [g.id, i]));

  const holdingsStable = [...holdings].sort(byOrderThenCreatedThenId);

  // A holding's color index is pinned to creation order, never display order,
  // so drag-reordering on /setup doesn't repaint it (or its neighbours) — a
  // holding keeps the same tint for its whole life, across every page.
  const colorSlotById = new Map<string, { index: number; total: number }>();
  const createdOrderByGroup = new Map<string, string[]>();
  [...holdings].sort(byCreatedThenId).forEach((h) => {
    const arr = createdOrderByGroup.get(h.groupId) ?? [];
    arr.push(h.id);
    createdOrderByGroup.set(h.groupId, arr);
  });
  createdOrderByGroup.forEach((ids) => {
    ids.forEach((id, index) => colorSlotById.set(id, { index, total: ids.length }));
  });

  // Resolve native/KRW price up front per holding — no live quote (no ticker,
  // or Toss lookup failed) falls back to avgPrice, already in the holding's
  // own native currency (KRW for 국내, USD for 해외).
  const resolvedPrices = new Map<string, ResolvedHoldingValue>();
  holdingsStable.forEach((h) => {
    resolvedPrices.set(h.id, resolveHoldingValueKrw(h, prices, usdKrwRate));
  });

  const totalValue = holdingsStable.reduce((sum, h) => sum + (resolvedPrices.get(h.id)?.value ?? 0), 0);

  const groupValue = new Map<string, number>();
  holdingsStable.forEach((h) => {
    const value = resolvedPrices.get(h.id)?.value ?? 0;
    groupValue.set(h.groupId, (groupValue.get(h.groupId) ?? 0) + value);
  });

  const holdingsCalc: HoldingCalc[] = holdingsStable.map((h) => {
    const group = groupById.get(h.groupId);
    const groupIndex = groupIndexById.get(h.groupId) ?? 0;
    const hue = hueForGroupIndex(groupIndex, sortedGroups.length);
    const colorSlot = colorSlotById.get(h.id) ?? { index: 0, total: 1 };
    const { priceNative, nativeCurrency, priceKrw, value, valueNative, hasLivePrice } = resolvedPrices.get(h.id)!;
    const actualPct = totalValue > 0 ? (value / totalValue) * 100 : 0;
    const gValue = groupValue.get(h.groupId) ?? 0;
    const actualPctInGroup = gValue > 0 ? (value / gValue) * 100 : 0;
    // Compared in the holding's own native currency (not priceKrw) so a
    // 해외 holding's return isn't distorted by FX movement since purchase —
    // avgPrice and priceNative are always in the same currency (see above).
    const returnPct = h.avgPrice > 0 ? ((priceNative - h.avgPrice) / h.avgPrice) * 100 : 0;

    return {
      ...h,
      color: tintForIndex(hue, colorSlot.index, colorSlot.total),
      groupName: group?.name ?? "미분류",
      groupColor: group ? colorFor(hue, 0) : "oklch(70% 0 0)",
      priceNative,
      nativeCurrency,
      priceKrw,
      hasLivePrice,
      value,
      valueNative,
      actualPct,
      actualPctInGroup,
      returnPct,
    };
  });

  const holdingsByGroup = new Map<string, HoldingCalc[]>();
  holdingsCalc.forEach((h) => {
    const arr = holdingsByGroup.get(h.groupId) ?? [];
    arr.push(h);
    holdingsByGroup.set(h.groupId, arr);
  });

  const groupsCalc: GroupCalc[] = sortedGroups.map((g, index) => {
    const members = holdingsByGroup.get(g.id) ?? [];
    const hue = hueForGroupIndex(index, sortedGroups.length);
    const actualPct = members.reduce((sum, h) => sum + h.actualPct, 0);
    const value = members.reduce((sum, h) => sum + h.value, 0);

    return {
      ...g,
      hue,
      color: colorFor(hue, 0),
      members,
      value,
      actualPct,
      diff: actualPct - g.targetPct,
      actionAmount: (g.targetPct / 100) * totalValue - value,
    };
  });

  const targetSum = sortedGroups.reduce((sum, g) => sum + g.targetPct, 0);

  return { groups: groupsCalc, holdings: holdingsCalc, totalValue, targetSum };
}

export function diffColor(diff: number): string {
  if (Math.abs(diff) < REBALANCE_THRESHOLD) return GOOD_COLOR;
  return diff > 0 ? OVER_TARGET_COLOR : UNDER_TARGET_COLOR;
}

export function actionLabel(diff: number): "유지" | "매도 필요" | "매수 필요" {
  if (Math.abs(diff) < REBALANCE_THRESHOLD) return "유지";
  return diff > 0 ? "매도 필요" : "매수 필요";
}

export function returnColor(returnPct: number): string {
  if (returnPct > 0) return GOOD_COLOR;
  if (returnPct < 0) return UNDER_TARGET_COLOR;
  return "var(--muted-foreground)";
}
