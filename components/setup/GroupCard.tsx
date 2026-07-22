import { fmtPct } from "@/lib/format";
import { GOOD_COLOR, type GroupCalc } from "@/lib/calc/rebalance";
import { HoldingInlineRow } from "./HoldingInlineRow";

export function GroupCard({ group }: { group: GroupCalc }) {
  const warn = group.memberTargetSumWarn;
  const gap = 100 - group.memberTargetSum;
  const wholeGap = (gap * group.targetPct) / 100;

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-5 sm:p-6">
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <div className="size-3.5 shrink-0 rounded-full" style={{ background: group.color }} />
        <span className="flex-1 text-[15px] font-semibold">{group.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          <span className={warn ? "text-destructive" : ""} style={warn ? undefined : { color: GOOD_COLOR }}>
            {warn
              ? gap > 0
                ? `그룹내 ${fmtPct(gap, 0)} 부족`
                : `그룹내 ${fmtPct(-gap, 0)} 초과`
              : `그룹내 ${fmtPct(group.memberTargetSum, 0)}`}
          </span>
          {` · 전체의 ${fmtPct(group.targetPct, 0)}`}
          {warn && (
            <span className="text-destructive">
              {" "}
              (환산 시 {gap > 0 ? `${fmtPct(wholeGap, 1)} 부족` : `${fmtPct(-wholeGap, 1)} 초과`})
            </span>
          )}
        </span>
      </div>

      {group.members.map((holding) => (
        <HoldingInlineRow key={holding.id} holding={holding} />
      ))}
    </div>
  );
}
