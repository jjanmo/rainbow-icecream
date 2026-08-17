import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { ExecutionFormDialog, type ExecutionSubmit } from '@/components/journal/ExecutionFormDialog';
import { DataErrorNotice } from '@/components/shared/DataErrorNotice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useExchangeRate, DEFAULT_USD_KRW_RATE } from '@/hooks/useExchangeRate';
import { useAddExecution, useDeleteExecution, useExecutions } from '@/hooks/useExecutions';
import { useGroups } from '@/hooks/useGroups';
import { useAddHolding, useHoldings } from '@/hooks/useHoldings';
import { currencyOf } from '@/lib/journal/cost';
import { OversoldError } from '@/lib/journal/commit';
import { fmtQty, fmtUsd, fmtWon } from '@/lib/format';
import { INTENT_LABELS, type Execution } from '@/types/journal';
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
  const fxQuery = useExchangeRate();
  const addExecution = useAddExecution();
  const deleteExecution = useDeleteExecution();
  const addHolding = useAddHolding();

  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const holdings = useMemo(() => holdingsQuery.data ?? [], [holdingsQuery.data]);
  const holdingById = useMemo(() => new Map(holdings.map((h) => [h.id, h])), [holdings]);

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

  const isLoading = groupsQuery.isLoading || holdingsQuery.isLoading || executionsQuery.isLoading;
  const isError = groupsQuery.isError || holdingsQuery.isError || executionsQuery.isError;
  const error = groupsQuery.error ?? holdingsQuery.error ?? executionsQuery.error;

  const dayList = selectedDay ? (executionsByDay.get(selectedDay) ?? []) : [];

  function shiftMonth(delta: number) {
    setSelectedDay(null);
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  async function handleSubmit(submit: ExecutionSubmit) {
    try {
      // 새 종목이면 수량 0으로 먼저 만들고, 이어지는 체결이 보유를 채운다.
      const holding = submit.holding ?? (await addHolding.mutateAsync(submit.newHolding!));
      await addExecution.mutateAsync({
        holding,
        execution: { ...submit.execution, holdingId: holding.id },
      });
      toast.success('체결을 기록했습니다. 보유 현황이 갱신됩니다.');
    } catch (err) {
      if (err instanceof OversoldError) {
        toast.error('보유 수량보다 많이 매도하는 체결이라 저장하지 않았습니다.');
        return;
      }
      console.error('Failed to save execution', err);
      toast.error('체결 저장에 실패했습니다.');
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
        <Button onClick={() => setDialogOpen(true)} disabled={(groupsQuery.data ?? []).length === 0}>
          + 체결 입력
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
        <>
          <div className="mb-5 rounded-lg border border-border bg-card p-4 sm:p-5">
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
                    className={`flex aspect-square flex-col items-center justify-center rounded-md text-xs transition-colors ${
                      isSelected
                        ? 'bg-accent text-accent-foreground'
                        : list.length > 0
                          ? 'bg-muted font-semibold hover:bg-accent'
                          : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span>{day}</span>
                    {list.length > 0 && <span className="mt-0.5 size-1 rounded-full bg-current" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="mb-3 text-[13px] font-semibold">
              {selectedDay ? `${selectedDay} 체결` : `${cursor.month + 1}월 전체 체결`}
            </div>
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
              onDelete={handleDelete}
            />
          </div>
        </>
      )}

      <ExecutionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        holdings={holdings}
        groupOptions={(groupsQuery.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
        defaultFxRate={fxQuery.data?.rate ?? DEFAULT_USD_KRW_RATE}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function ExecutionList({
  executions,
  holdingById,
  onDelete,
}: {
  executions: Execution[];
  holdingById: Map<string, Holding>;
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
            <span className="ml-auto shrink-0 font-mono text-xs">
              {fmtQty(e.qty)} × {fmt(e.price)}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              수수료 {fmt(e.feeAmount)}
              {e.taxAmount > 0 && ` · 세금 ${fmt(e.taxAmount)}`}
            </span>
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
