import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
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
import { OpeningBalanceHelp } from '@/components/journal/OpeningBalanceHelp';
import { DataErrorNotice } from '@/components/shared/DataErrorNotice';
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
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAddExecution, useDeleteExecution, useExecutions, useUpdateExecution } from '@/hooks/useExecutions';
import { useGroups } from '@/hooks/useGroups';
import { useAddHolding, useHoldings } from '@/hooks/useHoldings';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { useHistoricalFxRates } from '@/hooks/useHistoricalFxRates';
import { useTradeNotes, useUpsertTradeNote } from '@/hooks/useTradeNotes';
import { returnColor } from '@/lib/calc/rebalance';
import { OversoldError } from '@/lib/journal/commit';
import { replayHolding, type ClosedLot } from '@/lib/journal/replay';
import { hasActivity, summarizeExecutions, type TradeSummary } from '@/lib/journal/summary';
import { fmtUsd, fmtWon } from '@/lib/format';
import type { Execution, NewExecution, Side, TradeNote } from '@/types/journal';
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

type ViewMode = 'calendar' | 'period' | 'holding';
const VIEW_MODE_LABELS: Record<ViewMode, string> = { calendar: '달력', period: '기간', holding: '종목' };

type PeriodPreset = 'thisMonth' | 'last3Months' | 'thisYear' | 'all' | 'custom';
const PERIOD_PRESET_LABELS: Record<Exclude<PeriodPreset, 'custom'>, string> = {
  thisMonth: '이번 달',
  last3Months: '최근 3개월',
  thisYear: '올해',
  all: '전체',
};

interface DateRange {
  start: string;
  end: string;
}

function thisMonthRange(): DateRange {
  const t = new Date();
  const start = new Date(t.getFullYear(), t.getMonth(), 1);
  const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
  return { start: localDayKey(start.toISOString()), end: localDayKey(end.toISOString()) };
}

/** 프리셋 클릭 시점(이벤트 핸들러 안)에서만 호출한다 — 렌더 중에는 부르지 않는다. */
function presetRange(preset: Exclude<PeriodPreset, 'custom' | 'all'>): DateRange {
  const t = new Date();
  const end = localDayKey(t.toISOString());
  if (preset === 'thisMonth') return thisMonthRange();
  if (preset === 'last3Months') {
    const start = new Date(t.getFullYear(), t.getMonth() - 2, 1);
    return { start: localDayKey(start.toISOString()), end };
  }
  const start = new Date(t.getFullYear(), 0, 1);
  return { start: localDayKey(start.toISOString()), end };
}

/** 날짜 있는 체결들의 최초~최근 날짜. 기초잔고(날짜 없음)는 자연히 빠진다. */
function dateRangeOf(executions: Execution[]): DateRange | null {
  const days = executions.flatMap((e) => (e.executedAt ? [localDayKey(e.executedAt)] : []));
  if (days.length === 0) return null;
  return { start: days.reduce((a, b) => (a < b ? a : b)), end: days.reduce((a, b) => (a > b ? a : b)) };
}

/** 종목 콤보박스 표기 — ExecutionFormDialog와 같은 규칙(해외는 티커 먼저). */
function holdingOptionLabel(h: Holding): string {
  return h.region === '해외' && h.ticker ? `${h.ticker}(${h.name})` : h.name;
}

interface HoldingComboItem {
  value: string;
  label: string;
}

/** 한 종목의 근거를 매수/매도로 나눠 시간순으로 — 기초잔고(날짜 없음)는 항상 먼저. */
function notesForSide(
  executions: Execution[],
  tradeNotes: TradeNote[],
  side: Side,
): { execution: Execution; body: string }[] {
  return executions
    .filter((e) => e.side === side)
    .toSorted((a, b) => (a.executedAt ?? '').localeCompare(b.executedAt ?? ''))
    .flatMap((e) => {
      const body = tradeNotes.find((n) => n.executionId === e.id)?.body;
      return body ? [{ execution: e, body }] : [];
    });
}

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
  const [deleteTarget, setDeleteTarget] = useState<Execution | null>(null);
  const [openingBalanceListOpen, setOpeningBalanceListOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('thisMonth');
  const [periodRange, setPeriodRange] = useState<DateRange>(() => thisMonthRange());
  const [selectedHoldingId, setSelectedHoldingId] = useState('');

  const holdings = useMemo(() => holdingsQuery.data ?? [], [holdingsQuery.data]);
  const holdingById = useMemo(() => new Map(holdings.map((h) => [h.id, h])), [holdings]);
  const tradeNotes = useMemo(() => tradeNotesQuery.data ?? [], [tradeNotesQuery.data]);

  // 기초잔고는 날짜가 없어(ADR-0048) 캘린더에 실을 수 없다 — 별도 목록(아래
  // openingBalanceExecutions)에서만 보여준다. 실제 매매가 아니므로 애초에
  // 매수/매도 집계에도 넣지 않는다는 점은 그대로다 (ADR-0044).
  const executionsByDay = useMemo(() => {
    const map = new Map<string, Execution[]>();
    for (const e of executionsQuery.data ?? []) {
      if (e.intent === 'OPENING_BALANCE' || !e.executedAt) continue;
      const key = localDayKey(e.executedAt);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [executionsQuery.data]);

  const openingBalanceExecutions = useMemo(
    () => (executionsQuery.data ?? []).filter((e) => e.intent === 'OPENING_BALANCE'),
    [executionsQuery.data],
  );

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
    return (e: Execution) => (e.executedAt ? rates[localDayKey(e.executedAt)] : undefined);
  }, [fxQuery.data]);

  // monthExecutions는 executionsByDay에서 파생되고, 그쪽이 이미 기초잔고를 뺐으므로
  // 여기서 다시 거를 필요가 없다.
  const monthSummary = useMemo(
    () => summarizeExecutions(monthExecutions, holdingById, closedLotByExecutionId, rateForExecution),
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
    () => summarizeExecutions(dayList, holdingById, closedLotByExecutionId, rateForExecution),
    [dayList, holdingById, closedLotByExecutionId, rateForExecution],
  );

  // 기간 모드 — 달력의 월 단위 대신 임의 구간(프리셋 또는 직접 지정)으로 스코핑한다.
  // 기초잔고는 날짜가 없어 어느 구간에도 속하지 않으므로 자연히 빠진다.
  const periodExecutions = useMemo(
    () =>
      (executionsQuery.data ?? []).filter((e) => {
        if (!e.executedAt) return false;
        const day = localDayKey(e.executedAt);
        return day >= periodRange.start && day <= periodRange.end;
      }),
    [executionsQuery.data, periodRange],
  );
  const periodHasForeign = useMemo(
    () => periodExecutions.some((e) => holdingById.get(e.holdingId)?.region === '해외'),
    [periodExecutions, holdingById],
  );
  const periodFxQuery = useHistoricalFxRates(periodRange.start, periodRange.end, periodHasForeign);
  const periodRateForExecution = useMemo(() => {
    const rates = periodFxQuery.data?.rates;
    if (!rates) return undefined;
    return (e: Execution) => (e.executedAt ? rates[localDayKey(e.executedAt)] : undefined);
  }, [periodFxQuery.data]);
  const periodSummary = useMemo(
    () => summarizeExecutions(periodExecutions, holdingById, closedLotByExecutionId, periodRateForExecution),
    [periodExecutions, holdingById, closedLotByExecutionId, periodRateForExecution],
  );

  function applyPeriodPreset(preset: PeriodPreset) {
    setPeriodPreset(preset);
    if (preset === 'custom') return; // 사용자가 직접 입력할 때까지 대기
    if (preset === 'all') {
      const range = dateRangeOf(executionsQuery.data ?? []);
      if (range) setPeriodRange(range);
      return;
    }
    setPeriodRange(presetRange(preset));
  }

  // 종목 모드 — 그 종목의 전체 체결 이력(기초잔고 포함, 날짜 무관)을 한 번에 본다.
  const holdingExecutions = useMemo(
    () => (executionsQuery.data ?? []).filter((e) => e.holdingId === selectedHoldingId),
    [executionsQuery.data, selectedHoldingId],
  );
  const holdingFxRange = useMemo(() => dateRangeOf(holdingExecutions), [holdingExecutions]);
  const holdingHasForeign = holdingById.get(selectedHoldingId)?.region === '해외';
  const holdingFxQuery = useHistoricalFxRates(
    holdingFxRange?.start ?? '',
    holdingFxRange?.end ?? '',
    !!holdingFxRange && holdingHasForeign,
  );
  // 기초잔고는 날짜가 없어 체결일 환율을 구할 수 없으므로, 그 부분만 오늘 실시간
  // 환율로 환산한다 — 요약 합계에서 기초잔고를 아예 빼는 대신, "환산 기준일이
  // 다르다"는 걸 감수하고 포함시키는 쪽을 택했다 (사용자 요청).
  const liveFxQuery = useExchangeRate();
  const holdingRateForExecution = useMemo(() => {
    const historicalRates = holdingFxQuery.data?.rates;
    const liveRate = liveFxQuery.data?.rate;
    if (!historicalRates && liveRate === undefined) return undefined;
    return (e: Execution) => (e.executedAt ? historicalRates?.[localDayKey(e.executedAt)] : liveRate);
  }, [holdingFxQuery.data, liveFxQuery.data]);
  const holdingSummary = useMemo(
    () => summarizeExecutions(holdingExecutions, holdingById, closedLotByExecutionId, holdingRateForExecution),
    [holdingExecutions, holdingById, closedLotByExecutionId, holdingRateForExecution],
  );
  const holdingComboItems = useMemo(
    () => holdings.map((h): HoldingComboItem => ({ value: h.id, label: holdingOptionLabel(h) })),
    [holdings],
  );
  const holdingBuyNotes = useMemo(
    () => notesForSide(holdingExecutions, tradeNotes, 'BUY'),
    [holdingExecutions, tradeNotes],
  );
  const holdingSellNotes = useMemo(
    () => notesForSide(holdingExecutions, tradeNotes, 'SELL'),
    [holdingExecutions, tradeNotes],
  );

  // 우측 패널에 실제로 노출되는 범위 — 달력/기간 모드에서 고른 구간 안에서만 필터가 동작한다.
  // 종목 모드는 별도 레이아웃(holdingExecutions)을 쓰므로 여기 관여하지 않는다.
  const scopedExecutions = viewMode === 'period' ? periodExecutions : selectedDay ? dayList : monthExecutions;
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

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    handleDelete(deleteTarget);
    setDeleteTarget(null);
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setOpeningBalanceListOpen(true)}
            disabled={openingBalanceExecutions.length === 0}
          >
            기초잔고 보기
          </Button>
          <Button onClick={openAddDialog} disabled={(groupsQuery.data ?? []).length === 0}>
            + 매매 추가
          </Button>
        </div>
      </div>

      {isError && <DataErrorNotice error={error} />}

      <div className="mb-4 flex gap-1.5">
        {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
              viewMode === mode
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {VIEW_MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : (groupsQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">먼저 포트폴리오 설정에서 자산군을 추가해주세요.</p>
      ) : viewMode === 'holding' ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <Combobox<HoldingComboItem>
              items={holdingComboItems}
              value={holdingComboItems.find((i) => i.value === selectedHoldingId) ?? null}
              onValueChange={(item) => setSelectedHoldingId(item?.value ?? '')}
            >
              <ComboboxInput placeholder="종목 검색" className="w-full sm:w-80" />
              <ComboboxContent>
                <ComboboxEmpty>검색 결과가 없습니다.</ComboboxEmpty>
                <ComboboxList>
                  {(item: HoldingComboItem) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          {!selectedHoldingId ? (
            <p className="text-sm text-muted-foreground">종목을 선택하면 전체 매매 이력과 근거를 볼 수 있습니다.</p>
          ) : (
            <>
              {hasActivity(holdingSummary) && (
                <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
                  <TradeSummaryStrip
                    summary={holdingSummary}
                    fxLoading={holdingHasForeign && (holdingFxQuery.isLoading || liveFxQuery.isLoading)}
                  />
                </div>
              )}

              <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
                <div className="mb-3 text-[13px] font-semibold">전체 체결 이력</div>
                <ExecutionsTable
                  executions={holdingExecutions}
                  holdingById={holdingById}
                  closedLotByExecutionId={closedLotByExecutionId}
                  rateForExecution={holdingRateForExecution}
                  onEdit={openEditDialog}
                  onDelete={setDeleteTarget}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <NotesColumn title="매수 근거" notes={holdingBuyNotes} />
                <NotesColumn title="매도 근거" notes={holdingSellNotes} />
              </div>
            </>
          )}
        </div>
      ) : viewMode === 'period' ? (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5 lg:w-90 lg:shrink-0">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[15px] font-semibold">
                {periodRange.start} ~ {periodRange.end}
              </span>
              <span className="text-xs text-muted-foreground">체결 {periodExecutions.length}건</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(Object.keys(PERIOD_PRESET_LABELS) as Exclude<PeriodPreset, 'custom'>[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyPeriodPreset(preset)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    periodPreset === preset
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {PERIOD_PRESET_LABELS[preset]}
                </button>
              ))}
            </div>
            <div className="mb-3 flex items-center gap-2">
              <Input
                type="date"
                value={periodRange.start}
                onChange={(e) => {
                  setPeriodPreset('custom');
                  setPeriodRange((r) => ({ ...r, start: e.target.value }));
                }}
                className="font-mono text-xs"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <Input
                type="date"
                value={periodRange.end}
                onChange={(e) => {
                  setPeriodPreset('custom');
                  setPeriodRange((r) => ({ ...r, end: e.target.value }));
                }}
                className="font-mono text-xs"
              />
            </div>
            {hasActivity(periodSummary) && (
              <TradeSummaryStrip summary={periodSummary} fxLoading={periodFxQuery.isLoading} />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-card p-4 sm:p-5 lg:max-h-[calc(100vh-220px)]">
            <div className="mb-3 shrink-0 text-[13px] font-semibold">선택한 기간의 체결</div>
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
                rateForExecution={periodRateForExecution}
                onEdit={openEditDialog}
                onDelete={setDeleteTarget}
              />
            </div>
          </div>
        </div>
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
                onEdit={openEditDialog}
                onDelete={setDeleteTarget}
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

      <Dialog open={openingBalanceListOpen} onOpenChange={setOpeningBalanceListOpen}>
        <DialogContent className="scrollbar-hidden max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              기초잔고
              <OpeningBalanceHelp />
            </DialogTitle>
          </DialogHeader>
          {/* 날짜·실현손익 열은 뺀다 — 기초잔고는 예전부터 갖고 있던 베이스일 뿐,
              매매일(ADR-0048)도 매도 이력도 없어서 항상 비어 보였다. */}
          <ExecutionsTable
            executions={openingBalanceExecutions}
            holdingById={holdingById}
            closedLotByExecutionId={closedLotByExecutionId}
            showDateColumn={false}
            showRealizedPnlColumn={false}
            onEdit={(execution) => {
              setOpeningBalanceListOpen(false);
              openEditDialog(execution);
            }}
            onDelete={(execution) => {
              setOpeningBalanceListOpen(false);
              setDeleteTarget(execution);
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>체결 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              삭제하면 이후 구간이 다시 계산됩니다. 기록 자체는 남아있고, 목록에서만 사라집니다.
            </AlertDialogDescription>
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

/** 종목 모드의 "매수 근거"/"매도 근거" 칸 — 매수/매도를 나란히 분리해서 보여달라는
 * 요청대로 두 칸을 각각 이 컴포넌트로 렌더링한다. */
function NotesColumn({ title, notes }: { title: string; notes: { execution: Execution; body: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 text-[13px] font-semibold">{title}</div>
      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">기록된 근거가 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {notes.map(({ execution: e, body }) => (
            <div key={e.id} className="border-t border-border pt-2.5 text-xs first:border-t-0 first:pt-0">
              <div className="mb-1 text-[10px] text-muted-foreground">
                {e.executedAt ? localDayKey(e.executedAt) : '기초잔고'}
              </div>
              <p className="whitespace-pre-wrap">{body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
