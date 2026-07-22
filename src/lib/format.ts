export function fmtWon(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "₩0";
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
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
