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

export function fmtWon(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "₩0";
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "0%";
  return n.toFixed(digits) + "%";
}

export function fmtSigned(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "+0%";
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
