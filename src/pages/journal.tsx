import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ExecutionDetailDialog } from '@/components/journal/ExecutionDetailDialog';
import {
  ExecutionFormDialog,
  type ExecutionNoteDraft,
  type ExecutionSubmit,
} from '@/components/journal/ExecutionFormDialog';
import {
  ALL_EXECUTIONS_FILTER,
  ExecutionsFilterBar,
  matchesExecutionsFilter,
  type ExecutionsFilter,
} from '@/components/journal/ExecutionsFilterBar';
import { ExecutionsTable } from '@/components/journal/ExecutionsTable';
import { DataErrorNotice } from '@/components/shared/DataErrorNotice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddExecution, useDeleteExecution, useExecutions, useUpdateExecution } from '@/hooks/useExecutions';
import { useGroups } from '@/hooks/useGroups';
import { useAddHolding, useHoldings } from '@/hooks/useHoldings';
import { useHistoricalFxRates } from '@/hooks/useHistoricalFxRates';
import { useTradeNotes, useUpsertTradeNote } from '@/hooks/useTradeNotes';
import { returnColor } from '@/lib/calc/rebalance';
import { OversoldError } from '@/lib/journal/commit';
import { replayHolding, type ClosedLot } from '@/lib/journal/replay';
import { hasActivity, summarizeExecutions, type TradeSummary } from '@/lib/journal/summary';
import { fmtUsd, fmtWon } from '@/lib/format';
import type { Execution, NewExecution } from '@/types/journal';
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
  const [filter, setFilter] = useState<ExecutionsFilter>(ALL_EXECUTIONS_FILTER);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailExecution, setDetailExecution] = useState<Execution | null>(null);

  const holdings = useMemo(() => holdingsQuery.data ?? [], [holdingsQuery.data]);
  const holdingById = useMemo(() => new Map(holdings.map((h) => [h.id, h])), [holdings]);
  const tradeNotes = useMemo(() => tradeNotesQuery.data ?? [], [tradeNotesQuery.data]);
  // 체결 id로 근거를 바로 찾을 수 있게 미리 맵으로 만들어 둔다.
  const noteByExecutionId = useMemo(() => {
    const map = new Map<string, (typeof tradeNotes)[number]>();
    for (const n of tradeNotes) map.set(n.executionId, n);
    return map;
  }, [tradeNotes]);

  // 기초잔고 체결도 이제 일지에 그대로 보인다 — 배지로 구분하고("기초잔고"), 실제
  // 매매가 아니므로 매수/매도 합계 집계에서만 뺀다(아래 summary 계산부 참고) (ADR-0044).
  const executionsByDay = useMemo(() => {
    const map = new Map<string, Execution[]>();
    for (const e of executionsQuery.data ?? []) {
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
  const monthExecutions = useMemo(
    () =>
      [...executionsByDay.entries()]
        .filter(([day]) => day.startsWith(monthPrefix))
        .flatMap(([, list]) => list),
    [executionsByDay, monthPrefix],
  );
  // 해외 체결이 있는 달만 과거 환율을 조회한다 — 국내만 거래하는 달에는 불필요한 호출.
  const hasForeignExecutionThisMonth = useMemo(
    () => monthExecutions.some((e) => holdingById.get(e.holdingId)?.region === '해외'),
    [monthExecutions, holdingById],
  );
  const monthStart = `${monthPrefix}-01`;
  const monthEnd = `${monthPrefix}-${String(new Date(cursor.year, cursor.month + 1, 0).getDate()).padStart(2, '0')}`;
  const fxQuery = useHistoricalFxRates(monthStart, monthEnd, hasForeignExecutionThisMonth);
  // 체결일 기준 USD→KRW 환율 조회 — 실현손익은 여전히 거래 통화 기준이 원본이고
  // (ADR-0038), 이건 합계 표시에만 쓰는 참고용 환산이다.
  const rateForExecution = useMemo(() => {
    const rates = fxQuery.data?.rates;
    if (!rates) return undefined;
    return (e: Execution) => rates[localDayKey(e.executedAt)];
  }, [fxQuery.data]);

  const monthSummary = useMemo(
    () =>
      summarizeExecutions(
        monthExecutions.filter((e) => e.intent !== 'OPENING_BALANCE'),
        holdingById,
        closedLotByExecutionId,
        rateForExecution,
      ),
    [monthExecutions, holdingById, closedLotByExecutionId, rateForExecution],
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

  const dayList = useMemo(
    () => (selectedDay ? (executionsByDay.get(selectedDay) ?? []) : []),
    [selectedDay, executionsByDay],
  );
  const daySummary = useMemo(
    () =>
      summarizeExecutions(
        dayList.filter((e) => e.intent !== 'OPENING_BALANCE'),
        holdingById,
        closedLotByExecutionId,
        rateForExecution,
      ),
    [dayList, holdingById, closedLotByExecutionId, rateForExecution],
  );

  // 우측 패널에 실제로 노출되는 범위 — 달력에서 고른 기간(일/월) 안에서만 필터가 동작한다.
  const scopedExecutions = selectedDay ? dayList : monthExecutions;
  const filteredExecutions = useMemo(
    () => scopedExecutions.filter((e) => matchesExecutionsFilter(e, filter, holdingById.get(e.holdingId))),
    [scopedExecutions, filter, holdingById],
  );
  // 종목 필터 선택지도 지금 보고 있는 기간에 실제로 등장하는 종목으로만 좁힌다.
  const scopedHoldingOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of scopedExecutions) {
      if (seen.has(e.holdingId)) continue;
      const h = holdingById.get(e.holdingId);
      if (h) seen.set(e.holdingId, h.ticker ? `${h.ticker} (${h.name})` : h.name);
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [scopedExecutions, holdingById]);

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

  function openDetailDialog(execution: Execution) {
    setDetailExecution(execution);
    setDetailDialogOpen(true);
  }

  function handleDetailEdit() {
    if (!detailExecution) return;
    setDetailDialogOpen(false);
    openEditDialog(detailExecution);
  }

  function handleDetailDelete() {
    if (!detailExecution) return;
    setDetailDialogOpen(false);
    handleDelete(detailExecution);
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
      try {
        await upsertTradeNote.mutateAsync({ ...submit.note, executionId: execution.id });
      } catch (err) {
        console.error('Failed to save trade note', err);
        toast.error('체결은 저장됐지만 근거 저장에 실패했습니다.');
      }
    }
  }

  async function handleUpdate({
    id,
    patch,
    note,
  }: {
    id: string;
    patch: Omit<NewExecution, 'holdingId'>;
    note?: ExecutionNoteDraft;
  }) {
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
      return;
    }

    if (note) {
      try {
        await upsertTradeNote.mutateAsync({ ...note, executionId: id });
      } catch (err) {
        console.error('Failed to save trade note', err);
        toast.error('체결은 수정됐지만 근거 저장에 실패했습니다.');
      }
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
                <span className="text-xs text-muted-foreground">체결 {monthExecutions.length}건</span>
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

            {hasActivity(monthSummary) && (
              <TradeSummaryStrip summary={monthSummary} className="mb-3" fxLoading={fxQuery.isLoading} />
            )}

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
            <div className="mb-3 shrink-0">
              <div className="text-[13px] font-semibold">
                {selectedDay ? `${selectedDay} 체결` : `${cursor.month + 1}월 전체 체결`}
              </div>
              {selectedDay && hasActivity(daySummary) && (
                <TradeSummaryStrip summary={daySummary} className="mt-2" fxLoading={fxQuery.isLoading} />
              )}
            </div>
            {scopedExecutions.length > 0 && (
              <div className="mb-3 shrink-0">
                <ExecutionsFilterBar filter={filter} onChange={setFilter} holdingOptions={scopedHoldingOptions} />
              </div>
            )}
            <div className="scrollbar-hidden min-h-0 overflow-y-auto">
              <ExecutionsTable
                executions={filteredExecutions}
                holdingById={holdingById}
                closedLotByExecutionId={closedLotByExecutionId}
                rateForExecution={rateForExecution}
                onRowClick={openDetailDialog}
              />
            </div>
          </div>
        </div>
      )}

      <ExecutionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        holdings={holdings}
        executions={executionsQuery.data ?? []}
        groupOptions={(groupsQuery.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
        tradeNotes={tradeNotes}
        onSubmit={handleSubmit}
        editingExecution={editingExecution}
        onUpdate={handleUpdate}
      />

      <ExecutionDetailDialog
        execution={detailExecution}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        holding={detailExecution ? holdingById.get(detailExecution.holdingId) : undefined}
        closedLot={detailExecution ? closedLotByExecutionId.get(detailExecution.id) : undefined}
        note={detailExecution ? noteByExecutionId.get(detailExecution.id) : undefined}
        krwRate={detailExecution ? rateForExecution?.(detailExecution) : undefined}
        onEdit={handleDetailEdit}
        onDelete={handleDetailDelete}
      />
    </div>
  );
}

/**
 * 매수/매도/실현손익 × 해외/국내/합계 요약 표. 해외 행은 원화(환산) 위에 원래
 * 통화(달러)를 작게 병기하고, 국내·합계 행은 원화만 보여준다 — 국내는 애초에
 * 환산이 필요 없고, 합계는 통화가 섞인 기간을 하나의 숫자로 읽기 위한 참고값이라
 * 그 자체를 달러와 병기할 대상이 없다. 실현손익 원본(달러/원화 각각)은 여전히
 * 거래 통화 기준 그대로다 — ADR-0038이 금지한 "실현손익 자체를 환산값으로 대체"는
 * 하지 않는다.
 */
function TradeSummaryStrip({
  summary,
  className = '',
  fxLoading = false,
}: {
  summary: TradeSummary;
  className?: string;
  fxLoading?: boolean;
}) {
  return (
    <div className={`rounded-md bg-muted/50 p-2 text-[11px] ${className}`}>
      <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr] items-start gap-x-2 gap-y-1.5">
        <div />
        <div className="text-center text-muted-foreground">매수</div>
        <div className="text-center text-muted-foreground">매도</div>
        <div className="text-center text-muted-foreground">실현손익</div>

        <div className="pt-1 text-muted-foreground">해외</div>
        <AmountCell krw={summary.foreignKrw.buy} usd={summary.foreignUsd.buy} color="var(--diff-rise)" loading={fxLoading} />
        <AmountCell krw={summary.foreignKrw.sell} usd={summary.foreignUsd.sell} color="var(--diff-fall)" loading={fxLoading} />
        <AmountCell krw={summary.foreignKrw.realizedPnl} usd={summary.foreignUsd.realizedPnl} signed loading={fxLoading} />

        <div className="pt-1 text-muted-foreground">국내</div>
        <AmountCell krw={summary.domestic.buy} color="var(--diff-rise)" />
        <AmountCell krw={summary.domestic.sell} color="var(--diff-fall)" />
        <AmountCell krw={summary.domestic.realizedPnl} signed />

        <div className="border-t border-border pt-1.5 font-semibold text-muted-foreground">합계</div>
        <AmountCell krw={summary.totalKrw.buy} color="var(--diff-rise)" bold loading={fxLoading} border />
        <AmountCell krw={summary.totalKrw.sell} color="var(--diff-fall)" bold loading={fxLoading} border />
        <AmountCell krw={summary.totalKrw.realizedPnl} signed bold loading={fxLoading} border />
      </div>
      {summary.krwEquivalentIncomplete && !fxLoading && (
        <div className="mt-1.5 text-[10px] text-muted-foreground">* 일부 날짜는 환율을 못 구해 원화 값에서 빠졌습니다.</div>
      )}
    </div>
  );
}

function AmountCell({
  krw,
  usd,
  color,
  signed = false,
  bold = false,
  loading = false,
  border = false,
}: {
  krw: number;
  usd?: number;
  color?: string;
  signed?: boolean;
  bold?: boolean;
  loading?: boolean;
  border?: boolean;
}) {
  const isForeign = usd !== undefined;
  const nativeZero = isForeign ? usd === 0 : krw === 0;
  const borderCls = border ? 'border-t border-border pt-1.5' : '';

  if (nativeZero) {
    return <div className={`text-center text-muted-foreground ${borderCls}`}>—</div>;
  }

  const sign = (n: number) => (signed && n > 0 ? '+' : '');

  if (isForeign && loading) {
    return (
      <div className={`text-center ${borderCls}`}>
        <span className="font-mono">
          {sign(usd)}
          {fmtUsd(usd)}
        </span>
        <span className="block text-[10px] text-muted-foreground">환율 조회 중...</span>
      </div>
    );
  }

  return (
    <div
      className={`text-center font-mono ${bold ? 'font-semibold' : ''} ${borderCls}`}
      style={{ color: signed ? returnColor(krw) : color }}
    >
      {sign(krw)}
      {fmtWon(krw)}
      {isForeign && (
        <span className="block text-[10px] font-normal text-muted-foreground">
          {krw === 0 ? '환율 미확인' : `(${sign(usd)}${fmtUsd(usd)})`}
        </span>
      )}
    </div>
  );
}
