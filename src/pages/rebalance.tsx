import { useMemo } from 'react';
import { RebalanceSummaryCard } from '@/components/rebalance/RebalanceSummaryCard';
import { RebalanceTable } from '@/components/rebalance/RebalanceTable';
import { DataErrorNotice } from '@/components/shared/DataErrorNotice';
import { Skeleton } from '@/components/ui/skeleton';
import { useRebalanceData } from '@/hooks/useRebalanceData';
import { REBALANCE_THRESHOLD } from '@/lib/calc/rebalance';

export default function RebalancePage() {
  const { data, isLoading, isError, error } = useRebalanceData();

  // Sorted by how far off target each group is — the most urgent one first.
  const rows = useMemo(
    () => (data ? [...data.groups].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)) : []),
    [data],
  );

  const needsRebalance = useMemo(
    () =>
      rows
        .filter((g) => Math.abs(g.diff) >= REBALANCE_THRESHOLD)
        .map((g) => ({ name: g.name, diff: g.diff })),
    [rows],
  );

  return (
    <div>
      <div className="mb-5">
        <h1 className="mb-1.5 text-xl font-semibold sm:text-2xl">비중 체크</h1>
        <p className="text-sm text-muted-foreground">
          자산군별 목표와 실제 비중의 차이, 그리고 리밸런싱을 위해 필요한 조치를 확인하세요.
        </p>
      </div>

      {isError && <DataErrorNotice error={error} />}

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <RebalanceSummaryCard items={needsRebalance} />
          <RebalanceTable rows={rows} />
        </>
      )}
    </div>
  );
}
