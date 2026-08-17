import { useMemo } from 'react';
import { GroupProgressBar } from '@/components/rebalance/GroupProgressBar';
import { RebalanceTable } from '@/components/rebalance/RebalanceTable';
import { StatCards } from '@/components/rebalance/StatCards';
import { DataErrorNotice } from '@/components/shared/DataErrorNotice';
import { Skeleton } from '@/components/ui/skeleton';
import { useRebalanceData } from '@/hooks/useRebalanceData';
import { REBALANCE_THRESHOLD } from '@/lib/calc/rebalance';

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

    return { needsRebalanceHoldings, needsRebalanceGroups };
  }, [data]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="mb-1.5 text-xl font-semibold sm:text-2xl">비중 체크</h1>
        <p className="text-sm text-muted-foreground">
          목표와 실제 비중의 차이, 그리고 리밸런싱을 위해 필요한 조치를 확인하세요.
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
            needsRebalanceHoldings={summary.needsRebalanceHoldings}
            needsRebalanceGroups={summary.needsRebalanceGroups}
          />

          <div className="mb-5 rounded-lg border border-border bg-card p-5">
            <div className="mb-1.5 text-[13px] font-semibold">자산군 내 종목별 목표 비중</div>
            <p className="mb-3.5 text-xs text-muted-foreground">
              각 종목이 속한 자산군 안에서 가지는 목표 비중입니다.
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
