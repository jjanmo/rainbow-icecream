import { useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { HoldingFormDialog } from '@/components/holdings/HoldingFormDialog';
import { HoldingsTable } from '@/components/holdings/HoldingsTable';
import { ALL_HOLDINGS_FILTER, HoldingsFilterBar, type HoldingsFilter } from '@/components/holdings/HoldingsFilterBar';
import { DataErrorNotice } from '@/components/shared/DataErrorNotice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddHolding, useDeleteHolding, useUpdateHolding } from '@/hooks/useHoldings';
import { useRebalanceData } from '@/hooks/useRebalanceData';
import type { Holding } from '@/types/domain';

export default function HoldingsPage() {
  const { data, usdKrwRate, isLoading, isError, error } = useRebalanceData();
  const addHolding = useAddHolding();
  const updateHolding = useUpdateHolding();
  const deleteHolding = useDeleteHolding();

  const [filter, setFilter] = useState<HoldingsFilter>(ALL_HOLDINGS_FILTER);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holding | null>(null);

  const filteredHoldings = useMemo(() => {
    if (!data) return [];
    return data.holdings.filter(
      (h) =>
        (filter.groupId === 'all' || h.groupId === filter.groupId) &&
        (filter.account === 'all' || h.account === filter.account) &&
        (filter.region === 'all' || h.region === filter.region),
    );
  }, [data, filter]);

  const groupOptions = useMemo(() => data?.groups.map((g) => ({ id: g.id, name: g.name })) ?? [], [data]);

  const accountOptions = useMemo(() => {
    const values = (data?.holdings ?? []).map((h) => h.account).filter((a): a is string => !!a && a.trim().length > 0);
    return [...new Set(values)].sort();
  }, [data]);

  function openAddModal() {
    setEditingHolding(null);
    setModalOpen(true);
  }

  function openEditModal(holding: Holding) {
    setEditingHolding(holding);
    setModalOpen(true);
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    deleteHolding.mutate(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-xl font-semibold sm:text-2xl">보유 종목</h1>
          <p className="text-sm text-muted-foreground">보유 중인 종목을 직접 관리하세요.</p>
        </div>
        <Button onClick={openAddModal} disabled={groupOptions.length === 0}>
          + 종목 추가
        </Button>
      </div>

      {isError && <DataErrorNotice error={error} />}

      {isLoading || !data ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : groupOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">먼저 포트폴리오 설정에서 자산군을 추가해주세요.</p>
      ) : (
        <>
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            <HoldingsFilterBar
              filter={filter}
              onChange={setFilter}
              groupOptions={groupOptions}
              accountOptions={accountOptions}
            />
            <span className="shrink-0 text-xs text-muted-foreground">총 {filteredHoldings.length}개 종목</span>
          </div>
          <HoldingsTable
            rows={filteredHoldings}
            usdKrwRate={usdKrwRate}
            onEdit={openEditModal}
            onDelete={(id) => {
              const h = data.holdings.find((holding) => holding.id === id);
              if (h) setDeleteTarget(h);
            }}
          />
        </>
      )}

      <HoldingFormDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        groupOptions={groupOptions}
        defaultGroupId={groupOptions[0]?.id ?? null}
        initialHolding={editingHolding}
        onSubmit={(holding) => {
          if (editingHolding) {
            updateHolding.mutate({ id: editingHolding.id, patch: holding });
          } else {
            // 새 종목은 항상 수량 0으로 시작한다 — 매매일지의 첫 체결이 채운다 (ADR-0044).
            addHolding.mutate({ ...holding, qty: 0, avgPrice: 0 });
          }
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.name} 삭제</AlertDialogTitle>
            <AlertDialogDescription>목록에서 사라지지만, 이 종목의 매매 기록·메모는 삭제되지 않습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
