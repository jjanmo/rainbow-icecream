import { fmtPct } from "@/lib/format";
import type { GroupCalc } from "@/lib/calc/rebalance";
import { HoldingProgressBar } from "./HoldingProgressBar";
import { MiniBar } from "./MiniBar";

export function GroupProgressBar({ group }: { group: GroupCalc }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-1 flex items-center gap-2">
        <div className="size-[9px] shrink-0 rounded-full" style={{ background: group.color }} />
        <span className="text-[13px] font-semibold">{group.name}</span>
        <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
          목표 {fmtPct(group.targetPct, 0)} · 실제 {fmtPct(group.actualPct, 1)}
        </span>
      </div>
      <MiniBar label="목표" pct={group.targetPct} color={group.color} opacity={0.5} />
      <div className="mb-2.5">
        <MiniBar label="실제" pct={group.actualPct} color={group.color} />
      </div>

      {group.members.length > 0 && (
        <div className="flex flex-col gap-2 border-l-2 border-border pl-5">
          {group.members.map((holding) => (
            <HoldingProgressBar key={holding.id} holding={holding} />
          ))}
        </div>
      )}
    </div>
  );
}
