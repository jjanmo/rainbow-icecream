import type { ReactNode } from "react";
import { diffColor } from "@/lib/calc/rebalance";
import { fmtSigned } from "@/lib/format";

function StatCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-[200px] flex-1 rounded-xl border border-border bg-card px-5 py-4">
      <div className="mb-1.5 text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

export interface RebalanceItemSummary {
  name: string;
  diff: number;
}

function NeedsRebalanceList({ items }: { items: RebalanceItemSummary[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
      {items.map((item) => (
        <span key={item.name} style={{ color: diffColor(item.diff) }}>
          {item.name} {fmtSigned(item.diff, 1)}p
        </span>
      ))}
    </div>
  );
}

export function StatCards({
  totalValueFmt,
  needsRebalanceHoldings,
  needsRebalanceGroups,
}: {
  totalValueFmt: string;
  needsRebalanceHoldings: RebalanceItemSummary[];
  needsRebalanceGroups: RebalanceItemSummary[];
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-4">
      <StatCard label="총 평가금액">
        <div className="font-mono text-xl font-semibold">{totalValueFmt}</div>
      </StatCard>
      <StatCard label="리밸런싱 필요 종목">
        <div className="font-mono text-xl font-semibold">{needsRebalanceHoldings.length}개</div>
        <NeedsRebalanceList items={needsRebalanceHoldings} />
      </StatCard>
      <StatCard label="리밸런싱 필요 자산군">
        <div className="font-mono text-xl font-semibold">{needsRebalanceGroups.length}개</div>
        <NeedsRebalanceList items={needsRebalanceGroups} />
      </StatCard>
    </div>
  );
}
