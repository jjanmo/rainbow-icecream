import type { GroupCalc } from "@/lib/calc/rebalance";
import { HoldingProgressBar } from "./HoldingProgressBar";

export function GroupProgressBar({ group }: { group: GroupCalc }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="size-2.25 shrink-0 rounded-full" style={{ background: group.color }} />
        <span className="text-[13px] font-semibold">{group.name}</span>
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
