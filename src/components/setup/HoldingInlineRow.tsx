import type { HoldingCalc } from "@/lib/calc/rebalance";

export function HoldingInlineRow({ holding }: { holding: HoldingCalc }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-border py-2">
      <div className="size-2.5 shrink-0 rounded-full" style={{ background: holding.color }} />
      {holding.ticker && (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{holding.ticker}</span>
      )}
      <span className="flex-1 text-xs">{holding.name}</span>
    </div>
  );
}
