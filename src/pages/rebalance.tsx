import { useMemo } from 'react';
import { AllocationDonutChart } from '@/components/shared/AllocationDonutChart';
import { GroupProgressBar } from '@/components/rebalance/GroupProgressBar';
import { RebalanceTable } from '@/components/rebalance/RebalanceTable';
import { StatCards } from '@/components/rebalance/StatCards';
import { DataErrorNotice } from '@/components/shared/DataErrorNotice';
import { Skeleton } from '@/components/ui/skeleton';
import { useRebalanceData } from '@/hooks/useRebalanceData';
import { REBALANCE_THRESHOLD } from '@/lib/calc/rebalance';
import { fmtPct, fmtWon } from '@/lib/format';

export default function RebalancePage() {
  const { data, isLoading, isError, error } = useRebalanceData();

  const summary = useMemo(() => {
    if (!data) return undefined;

    const needsRebalanceHoldings = data.holdings
      .filter((h) => Math.abs(h.diff) >= REBALANCE_THRESHOLD)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .map((h) => ({ name: h.name, diff: h.diff }));
    const needsRebalanceGroups = data.groups
      .filter((g) => Math.abs(g.diff) >= REBALANCE_THRESHOLD)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .map((g) => ({ name: g.name, diff: g.diff }));

    const targetSlices = data.groups.map((g) => ({
      id: g.id,
      name: g.name,
      value: g.targetPct,
      color: g.color,
      valueLabel: fmtPct(g.targetPct, 0),
    }));
    const actualSlices = data.groups.map((g) => ({
      id: g.id,
      name: g.name,
      value: g.actualPct,
      color: g.color,
      valueLabel: fmtPct(g.actualPct, 1),
    }));

    return { needsRebalanceHoldings, needsRebalanceGroups, targetSlices, actualSlices };
  }, [data]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="mb-1.5 text-xl font-semibold sm:text-2xl">비중 체크</h1>
        <p className="text-sm text-muted-foreground">
          자산군 사이의 비중과, 자산군 안에서 종목 사이의 비중을 함께 확인하세요.
        </p>
      </div>

      {isError && <DataErrorNotice error={error} />}

      {isLoading || !data || !summary ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <StatCards
            totalValueFmt={fmtWon(data.totalValue)}
            needsRebalanceHoldings={summary.needsRebalanceHoldings}
            needsRebalanceGroups={summary.needsRebalanceGroups}
          />

          <div className="mb-5 flex flex-wrap gap-4">
            <AllocationDonutChart title="자산군 간 목표 비중" centerLabel="목표" data={summary.targetSlices} />
            <AllocationDonutChart title="자산군 간 실제 비중" centerLabel="실제" data={summary.actualSlices} />
          </div>

          <div className="mb-5 rounded-lg border border-border bg-card p-5">
            <div className="mb-1.5 text-[13px] font-semibold">자산군별 · 자산군 내 목표 vs 실제</div>
            <p className="mb-3.5 text-xs text-muted-foreground">
              굵은 바는 전체 포트폴리오 기준, 아래 얇은 바는 각 자산군 내부 비중 기준입니다.
            </p>
            {data.groups.map((group) => (
              <GroupProgressBar key={group.id} group={group} />
            ))}
          </div>

          <RebalanceTable rows={data.rebalanceRows} />
        </>
      )}
    </div>
  );
}
