import { fmtPct } from "@/lib/format";
import type { HoldingCalc } from "@/lib/calc/rebalance";
import { MiniBar } from "./MiniBar";

export function HoldingProgressBar({ holding }: { holding: HoldingCalc }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-2 text-[11.5px]">
        <span className="text-foreground/85">{holding.name}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
          그룹내 목표 {fmtPct(holding.targetPctInGroup)}
        </span>
      </div>
      <MiniBar label="목표" pct={holding.targetPctInGroup} color={holding.color} thin />
    </div>
  );
}
