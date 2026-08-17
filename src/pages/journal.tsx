import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { ExecutionFormDialog, type ExecutionSubmit } from '@/components/journal/ExecutionFormDialog';
import { DataErrorNotice } from '@/components/shared/DataErrorNotice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddExecution, useDeleteExecution, useExecutions, useUpdateExecution } from '@/hooks/useExecutions';
import { useGroups } from '@/hooks/useGroups';
import { useAddHolding, useHoldings } from '@/hooks/useHoldings';
import { useTradeNotes, useUpsertTradeNote } from '@/hooks/useTradeNotes';
import { returnColor } from '@/lib/calc/rebalance';
import { currencyOf } from '@/lib/journal/cost';
import { OversoldError } from '@/lib/journal/commit';
import { executionNoteKey, positionNoteKey } from '@/lib/journal/noteTarget';
import { replayHolding, type ClosedLot } from '@/lib/journal/replay';
import { fmtQty, fmtUsd, fmtWon } from '@/lib/format';
import { INTENT_LABELS, type Execution, type NewExecution } from '@/types/journal';
import type { Holding } from '@/types/domain';

/** 로컬 시간대 기준 'YYYY-MM-DD'. 체결은 UTC로 저장되므로 표시 시점에 변환한다. */
function localDayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function JournalPage() {
  const groupsQuery = useGroups();
  const holdingsQuery = useHoldings();
  const executionsQuery = useExecutions();
  const tradeNotesQuery = useTradeNotes();
  const addExecution = useAddExecution();
  const updateExecution = useUpdateExecution();
  const deleteExecution = useDeleteExecution();
  const addHolding = useAddHolding();
  const upsertTradeNote = useUpsertTradeNote();

  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExecution, setEditingExecution] = useState<Execution | null>(null);

  const holdings = useMemo(() => holdingsQuery.data ?? [], [holdingsQuery.data]);
  const holdingById = useMemo(() => new Map(holdings.map((h) => [h.id, h])), [holdings]);
  const tradeNotes = useMemo(() => tradeNotesQuery.data ?? [], [tradeNotesQuery.data]);
  // 셋업 태그 자동완성 후보 — holdings.tsx의 accountOptions와 같은 파생 패턴.
  const setupTagSuggestions = useMemo(
    () => [...new Set(tradeNotes.flatMap((n) => n.setupTags))].sort(),
    [tradeNotes],
  );

  const executionsByDay = useMemo(() => {
    const map = new Map<string, Execution[]>();
    for (const e of executionsQuery.data ?? []) {
      // 기초잔고는 실제 매매가 아니라 이월 잔고라서 일지에 섞지 않는다.
      if (e.intent === 'OPENING_BALANCE') continue;
      const key = localDayKey(e.executedAt);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [executionsQuery.data]);

  // 매도 체결 하나당 실현손익 1건 — 종목별로 전체 이력을 리플레이해서 얻는다
  // (replayHolding은 순수 함수라 여기서 다시 돌려도 안전하다, ADR-0032). 거래
  // 통화 기준으로만 보여주고 원화로 환산하지 않는다 (ADR-0038).
  const closedLotByExecutionId = useMemo(() => {
    const byHolding = new Map<string, Execution[]>();
    for (const e of executionsQuery.data ?? []) {
      const arr = byHolding.get(e.holdingId) ?? [];
      arr.push(e);
      byHolding.set(e.holdingId, arr);
    }
    const map = new Map<string, ClosedLot>();
    for (const [holdingId, execs] of byHolding) {
      const holding = holdingById.get(holdingId);
      if (!holding) continue;
      const { closedLots } = replayHolding(execs, { region: holding.region });
      for (const lot of closedLots) map.set(lot.executionId, lot);
    }
    return map;
  }, [executionsQuery.data, holdingById]);

  const monthPrefix = monthKey(cursor.year, cursor.month);
  const monthCount = useMemo(
    () =>
      [...executionsByDay.entries()]
        .filter(([day]) => day.startsWith(monthPrefix))
        .reduce((sum, [, list]) => sum + list.length, 0),
    [executionsByDay, monthPrefix],
  );

  // 달력 격자: 1일이 시작되는 요일만큼 앞을 비운다.
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const lead = first.getDay();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
  }, [cursor]);

  const isLoading =
    groupsQuery.isLoading || holdingsQuery.isLoading || executionsQuery.isLoading || tradeNotesQuery.isLoading;
  const isError = groupsQuery.isError || holdingsQuery.isError || executionsQuery.isError || tradeNotesQuery.isError;
  const error = groupsQuery.error ?? holdingsQuery.error ?? executionsQuery.error ?? tradeNotesQuery.error;

  const dayList = selectedDay ? (executionsByDay.get(selectedDay) ?? []) : [];

  function shiftMonth(delta: number) {
    setSelectedDay(null);
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function goToToday() {
    const t = new Date();
    setCursor({ year: t.getFullYear(), month: t.getMonth() });
    setSelectedDay(localDayKey(t.toISOString()));
  }

  function openAddDialog() {
    setEditingExecution(null);
    setDialogOpen(true);
  }

  function openEditDialog(execution: Execution) {
    setEditingExecution(execution);
    setDialogOpen(true);
  }

  async function handleSubmit(submit: ExecutionSubmit) {
    let holding: Holding;
    let execution: Execution;
    try {
      // 새 종목이면 수량 0으로 먼저 만들고, 이어지는 체결이 보유를 채운다.
      holding = submit.holding ?? (await addHolding.mutateAsync(submit.newHolding!));
      ({ execution } = await addExecution.mutateAsync({
        holding,
        execution: { ...submit.execution, holdingId: holding.id },
      }));
      toast.success('체결을 기록했습니다. 보유 현황이 갱신됩니다.');
    } catch (err) {
      if (err instanceof OversoldError) {
        toast.error('보유 수량보다 많이 매도하는 체결이라 저장하지 않았습니다.');
        return;
      }
      console.error('Failed to save execution', err);
      toast.error('체결 저장에 실패했습니다.');
      return;
    }

    // 체결은 이미 저장됐으므로, 근거 저장이 실패해도 롤백하지 않고 별도로 알린다.
    if (submit.note) {
      const targetKey =
        submit.note.targetType === 'POSITION' ? positionNoteKey(holding.id) : executionNoteKey(execution.id);
      try {
        await upsertTradeNote.mutateAsync({ ...submit.note, targetKey });
      } catch (err) {
        console.error('Failed to save trade note', err);
        toast.error('체결은 저장됐지만 근거 저장에 실패했습니다.');
      }
    }
  }

  async function handleUpdate({ id, patch }: { id: string; patch: Omit<NewExecution, 'holdingId'> }) {
    const target = executionsQuery.data?.find((e) => e.id === id);
    const holding = target ? holdingById.get(target.holdingId) : undefined;
    if (!holding) return;
    try {
      await updateExecution.mutateAsync({ holding, id, patch });
      toast.success('체결을 수정했습니다. 이후 구간이 재계산됩니다.');
    } catch (err) {
      if (err instanceof OversoldError) {
        toast.error('보유 수량보다 많이 매도하는 체결이라 수정하지 않았습니다.');
        return;
      }
      console.error('Failed to update execution', err);
      toast.error('수정에 실패했습니다.');
    }
  }

  async function handleDelete(execution: Execution) {
    const holding = holdingById.get(execution.holdingId);
    if (!holding) return;
    try {
      await deleteExecution.mutateAsync({ holding, id: execution.id });
      toast.success('체결을 삭제했습니다. 이후 구간이 재계산됩니다.');
    } catch (err) {
      console.error('Failed to delete execution', err);
      toast.error('삭제에 실패했습니다.');
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-xl font-semibold sm:text-2xl">매매일지</h1>
          <p className="text-sm text-muted-foreground">
            체결을 기록하면 보유 현황이 그 기록에서 자동으로 계산됩니다.
          </p>
        </div>
        <Button onClick={openAddDialog} disabled={(groupsQuery.data ?? []).length === 0}>
          + 매매 추가
        </Button>
      </div>

      {isError && <DataErrorNotice error={error} />}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : (groupsQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">먼저 포트폴리오 설정에서 자산군을 추가해주세요.</p>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5 lg:w-90 lg:shrink-0">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-semibold">
                  {cursor.year}년 {cursor.month + 1}월
                </span>
                <span className="text-xs text-muted-foreground">체결 {monthCount}건</span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-xs" onClick={() => shiftMonth(-1)} title="이전 달">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="ghost" size="xs" onClick={goToToday} title="오늘로 이동">
                  오늘
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={() => shiftMonth(1)} title="다음 달">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w) => (
                <div key={w} className="pb-1 text-[11px] text-muted-foreground">
                  {w}
                </div>
              ))}
              {cells.map((day, i) => {
                if (day === null) return <div key={`lead-${i}`} />;
                const key = `${monthPrefix}-${String(day).padStart(2, '0')}`;
                const list = executionsByDay.get(key) ?? [];
                const isSelected = selectedDay === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(isSelected ? null : key)}
                    className={`flex aspect-square flex-col items-center justify-center rounded-md border text-xs transition-colors ${
                      isSelected
                        ? 'border-primary bg-accent text-accent-foreground'
                        : list.length > 0
                          ? 'border-border bg-muted font-semibold hover:bg-accent'
                          : 'border-border/60 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span>{day}</span>
                    {list.length > 0 && <span className="mt-0.5 size-1 rounded-full bg-current" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* lg 이상에서는 달력과 나란히 두고 목록만 내부 스크롤한다 — 목록이 길어져도
              페이지 자체가 스크롤되면서 달력이 화면 밖으로 밀려나지 않게 하기 위해서다.
              높이 값은 상단 네비게이션 + 페이지 헤더가 차지하는 대략적인 여백을 뺀 값이다. */}
          <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-card p-4 sm:p-5 lg:max-h-[calc(100vh-220px)]">
            <div className="mb-3 shrink-0 text-[13px] font-semibold">
              {selectedDay ? `${selectedDay} 체결` : `${cursor.month + 1}월 전체 체결`}
            </div>
            <div className="min-h-0 overflow-y-auto">
              <ExecutionList
                executions={
                  selectedDay
                    ? dayList
                    : [...executionsByDay.entries()]
                        .filter(([d]) => d.startsWith(monthPrefix))
                        .flatMap(([, list]) => list)
                        .sort((a, b) => b.executedAt.localeCompare(a.executedAt))
                }
                holdingById={holdingById}
                closedLotByExecutionId={closedLotByExecutionId}
                onEdit={openEditDialog}
                onDelete={handleDelete}
              />
            </div>
          </div>
        </div>
      )}

      <ExecutionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        holdings={holdings}
        groupOptions={(groupsQuery.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
        tradeNotes={tradeNotes}
        setupTagSuggestions={setupTagSuggestions}
        onSubmit={handleSubmit}
        editingExecution={editingExecution}
        onUpdate={handleUpdate}
      />
    </div>
  );
}

function ExecutionList({
  executions,
  holdingById,
  closedLotByExecutionId,
  onEdit,
  onDelete,
}: {
  executions: Execution[];
  holdingById: Map<string, Holding>;
  closedLotByExecutionId: Map<string, ClosedLot>;
  onEdit: (execution: Execution) => void;
  onDelete: (execution: Execution) => void;
}) {
  if (executions.length === 0) {
    return <p className="text-xs text-muted-foreground">기록된 체결이 없습니다.</p>;
  }

  return (
    <div className="flex flex-col">
      {executions.map((e) => {
        const holding = holdingById.get(e.holdingId);
        const currency = holding ? currencyOf(holding.region) : 'KRW';
        const fmt = (n: number) => (currency === 'USD' ? fmtUsd(n) : fmtWon(n));
        const isBuy = e.side === 'BUY';
        const closedLot = closedLotByExecutionId.get(e.id);
        return (
          <div
            key={e.id}
            className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border py-2.5 first:border-t-0"
          >
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold"
              style={{ color: isBuy ? 'var(--diff-rise)' : 'var(--diff-fall)' }}
            >
              {isBuy ? '매수' : '매도'}
            </span>
            <span className="text-[13px] font-semibold">{holding?.name ?? '삭제된 종목'}</span>
            {holding?.ticker && (
              <span className="font-mono text-[11px] text-muted-foreground">{holding.ticker}</span>
            )}
            <span className="text-[11px] text-muted-foreground">{INTENT_LABELS[e.intent]}</span>
            {closedLot && (
              <span className="font-mono text-[11px] font-semibold" style={{ color: returnColor(closedLot.realizedPnl) }}>
                실현손익 {closedLot.realizedPnl >= 0 ? '+' : ''}
                {fmt(closedLot.realizedPnl)}
              </span>
            )}
            <span className="ml-auto shrink-0 font-mono text-xs">
              {fmtQty(e.qty)} × {fmt(e.price)}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onEdit(e)}
              className="shrink-0 text-muted-foreground"
              title="체결 수정"
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onDelete(e)}
              className="shrink-0 text-muted-foreground"
              title="체결 삭제 (이후 구간 재계산)"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
