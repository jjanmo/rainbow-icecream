import { diffColor, REBALANCE_THRESHOLD } from '@/lib/calc/rebalance';
import { fmtSigned } from '@/lib/format';

export interface RebalanceItemSummary {
  name: string;
  diff: number;
}

/** Headline count of asset groups that drifted past REBALANCE_THRESHOLD.
 * Groups only — see ADR-0024 for why holdings aren't judged individually. */
export function RebalanceSummaryCard({ items }: { items: RebalanceItemSummary[] }) {
  return (
    <div className="mb-5 rounded-xl border border-border bg-card px-5 py-4">
      <div className="mb-1.5 text-xs text-muted-foreground">
        리밸런싱 필요 자산군 (목표 대비 {REBALANCE_THRESHOLD}%p 이상 벗어남)
      </div>
      <div className="font-mono text-xl font-semibold">{items.length}개</div>
      {items.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
          {items.map((item) => (
            <span key={item.name} style={{ color: diffColor(item.diff) }}>
              {item.name} {fmtSigned(item.diff)}p
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
