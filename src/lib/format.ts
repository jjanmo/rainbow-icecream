import type { Region } from "@/types/domain";

/**
 * Shortest label that still identifies a holding, for tight spots like the
 * group donut's center readout. 해외 종목은 티커가 곧 이름 역할을 하므로
 * 티커로 대체하고, 국내 종목은 이름을 그대로 쓴다.
 */
export function shortHoldingLabel(holding: {
  name: string;
  ticker: string | null;
  region: Region;
}): string {
  if (holding.region === "해외" && holding.ticker) return holding.ticker;
  return holding.name;
}

/**
 * 종목 목록 다운로드용 표시 형식 — "종목명(코드)"(국내) 또는 "종목명(티커)"(해외).
 * 코드/티커가 없는 현금성 자산(ticker: null)은 이름만 반환한다.
 */
export function holdingDownloadLabel(holding: {
  name: string;
  ticker: string | null;
}): string {
  return holding.ticker ? `${holding.name}(${holding.ticker})` : holding.name;
}

export function fmtWon(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "₩0";
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return (0).toFixed(digits) + "%";
  return n.toFixed(digits) + "%";
}

/** Same 2-digit default as fmtPct — a lower override rounds small values down
 * to a misleading "+0%", so don't pass one. */
export function fmtSigned(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "+" + (0).toFixed(digits) + "%";
  const sign = n > 0 ? "+" : "";
  return sign + n.toFixed(digits) + "%";
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "$0.00";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtQty(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 4 });
}
