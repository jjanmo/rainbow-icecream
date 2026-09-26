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
import { useAddHolding, useAllHoldings, useHoldings, useUpdateHolding } from '@/hooks/useHoldings';
import { useAddAxisCategory, useAxisCategories } from '@/hooks/useAxisCategories';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { useHistoricalFxRates } from '@/hooks/useHistoricalFxRates';
import { useDeleteTradeNote, useTradeNotes, useUpsertTradeNote } from '@/hooks/useTradeNotes';
import { useComboboxSearch } from '@/hooks/useComboboxSearch';
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

type ViewMode = 'period' | 'holding';
const VIEW_MODE_LABELS: Record<ViewMode, string> = { period: '기간', holding: '종목' };

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

function isNextCalendarDay(a: string, b: string): boolean {
  const [ay, am, ad] = a.split('-').map(Number);
  const next = new Date(ay, am - 1, ad + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}` === b;
}

/** 선택한 날짜들(정렬됨)을 연속 구간끼리 묶어 표시한다 — 17,19처럼 떨어진 날짜를
 * "17~19"로 뭉뚱그리면 18일도 포함된 것처럼 보이는 오해가 생긴다. 연속된 날짜만
 * "~"로 묶고, 나머지는 쉼표로 나열한다. */
function formatSelectedDays(sortedDays: string[]): string {
  const runs: string[][] = [];
  for (const d of sortedDays) {
    const lastRun = runs[runs.length - 1];
    const prev = lastRun?.[lastRun.length - 1];
    if (prev && isNextCalendarDay(prev, d)) {
      lastRun.push(d);
    } else {
      runs.push([d]);
    }
  }
  return runs.map((run) => (run.length === 1 ? run[0] : `${run[0]} ~ ${run[run.length - 1]}`)).join(', ');
}

/** 종목 콤보박스 표기 — ExecutionFormDialog와 같은 규칙(해외는 티커 먼저). */
function holdingOptionLabel(h: Holding): string {
  return h.region === '해외' && h.ticker ? `${h.ticker}(${h.name})` : h.name;
}

/** 종목 모드의 "같은 종목" 판단 기준 — 티커+지역(계좌는 무시). 전량 매도로
 * 삭제된 뒤 다시 산 종목은 holding row가 여러 개로 나뉘어 있어도, 이 키가
 * 같으면 하나의 검색 결과·하나의 이력으로 합쳐 보여준다. 현금성 자산(ticker
 * null)은 이름으로 대신 구분한다. */
function holdingIdentityKey(h: Holding): string {
  return h.ticker ? `T:${h.ticker}|${h.region}` : `N:${h.name}|${h.region}`;
}

/** 그룹 안에서 콤보박스에 보여줄 대표 하나를 고른다 — 활성 상태를 우선하고
 * (지금 쓰는 정확한 이름을 보여주기 위해), 전부 삭제된 상태면 가장 최근 것. */
function pickRepresentativeHolding(group: Holding[]): Holding {
  return group.find((h) => !h.deletedAt) ?? [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
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
  const holdingsQuery = useHoldings();
  const allHoldingsQuery = useAllHoldings();
  const executionsQuery = useExecutions();
  const tradeNotesQuery = useTradeNotes();
  const addExecution = useAddExecution();
  const updateExecution = useUpdateExecution();
  const deleteExecution = useDeleteExecution();
  const addHolding = useAddHolding();
  const updateHolding = useUpdateHolding();
  const upsertTradeNote = useUpsertTradeNote();
  const deleteTradeNote = useDeleteTradeNote();
  const roleCategoriesQuery = useAxisCategories('role');
  const sectorCategoriesQuery = useAxisCategories('sector');
  const addAxisCategory = useAddAxisCategory();

  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  // 프리셋/직접 지정(range)과 달력 낱개 클릭(days)은 서로 독립된 두 가지 필터
  // 방법이다 — 하나를 쓰면 다른 하나는 꺼진다. 프리셋을 눌러도 달력에 개별 날짜가
  // "선택됨"으로 칠해지지 않으므로, 그 상태에서 하루만 보고 싶으면 그 날짜 하나만
  // 클릭하면 된다(다른 날짜들을 일일이 해제할 필요가 없다).
  const [selectionMode, setSelectionMode] = useState<'range' | 'days'>('range');
  const [selectedDays, setSelectedDays] = useState<Set<string>>(() => new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExecution, setEditingExecution] = useState<Execution | null>(null);
  const [filter, setFilter] = useState<ExecutionsFilter>(ALL_EXECUTIONS_FILTER);
  const [deleteTarget, setDeleteTarget] = useState<Execution | null>(null);
  const [openingBalanceListOpen, setOpeningBalanceListOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('period');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('thisMonth');
  const [periodRange, setPeriodRange] = useState<DateRange>(() => thisMonthRange());
  const [selectedHoldingId, setSelectedHoldingId] = useState('');

  // holdings(활성)는 체결 입력 시 "보유종목에서 고르기"(ExecutionFormDialog)
  // 전용 — 지금 실제로 갖고 있는 것만 골라야 하므로 삭제된 종목을 섞지 않는다.
  // allHoldings(삭제분 포함)는 그 외 매매일지 전체(요약·필터·체결 테이블·종목
  // 모드)가 쓴다 — 예전에 전량 매도해 삭제된 종목의 매매 기록도 여기서 조회해야
  // 하기 때문이다.
  const holdings = useMemo(() => holdingsQuery.data ?? [], [holdingsQuery.data]);
  const allHoldings = useMemo(() => allHoldingsQuery.data ?? [], [allHoldingsQuery.data]);
  const holdingById = useMemo(() => new Map(allHoldings.map((h) => [h.id, h])), [allHoldings]);
  const tradeNotes = useMemo(() => tradeNotesQuery.data ?? [], [tradeNotesQuery.data]);

  // 티커+지역이 같은 holding row들을 하나의 종목으로 묶는다 — 삭제 후 재매수로
  // row가 여러 개 생겨도 종목 모드에서는 검색 결과 하나, 이력도 하나로 합쳐 보여야
  // 한다. 그룹 대표는 활성 row를 우선하고(가장 최근 이름을 보여주기 위해), 전부
  // 삭제된 상태면 가장 최근에 만들어진 row를 쓴다.
  const holdingGroupsByKey = useMemo(() => {
    const map = new Map<string, Holding[]>();
    for (const h of allHoldings) {
      const key = holdingIdentityKey(h);
      const arr = map.get(key) ?? [];
      arr.push(h);
      map.set(key, arr);
    }
    return map;
  }, [allHoldings]);
  const groupKeyByHoldingId = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of allHoldings) map.set(h.id, holdingIdentityKey(h));
    return map;
  }, [allHoldings]);

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
    holdingsQuery.isLoading ||
    allHoldingsQuery.isLoading ||
    executionsQuery.isLoading ||
    tradeNotesQuery.isLoading;
  const isError =
    holdingsQuery.isError || allHoldingsQuery.isError || executionsQuery.isError || tradeNotesQuery.isError;
  const error = holdingsQuery.error ?? allHoldingsQuery.error ?? executionsQuery.error ?? tradeNotesQuery.error;

  // range 모드는 [start,end] 구간으로, days 모드는 낱개로 고른 날짜 집합으로 거른다
  // — 서로 배타적이라 지금 켜진 모드 하나만 본다.
  const periodExecutions = useMemo(() => {
    if (selectionMode === 'days') {
      return (executionsQuery.data ?? []).filter((e) => e.executedAt && selectedDays.has(localDayKey(e.executedAt)));
    }
    return (executionsQuery.data ?? []).filter((e) => {
      if (!e.executedAt) return false;
      const day = localDayKey(e.executedAt);
      return day >= periodRange.start && day <= periodRange.end;
    });
  }, [selectionMode, selectedDays, executionsQuery.data, periodRange]);
  const periodFxRange = useMemo(() => dateRangeOf(periodExecutions), [periodExecutions]);
  const periodHasForeign = useMemo(
    () => periodExecutions.some((e) => holdingById.get(e.holdingId)?.region === '해외'),
    [periodExecutions, holdingById],
  );
  const periodFxQuery = useHistoricalFxRates(
    periodFxRange?.start ?? '',
    periodFxRange?.end ?? '',
    !!periodFxRange && periodHasForeign,
  );
  // 체결일 기준 USD→KRW 환율 조회 — 실현손익은 여전히 거래 통화 기준이 원본이고
  // (ADR-0038), 이건 합계 표시에만 쓰는 참고용 환산이다.
  const periodRateForExecution = useMemo(() => {
    const rates = periodFxQuery.data?.rates;
    if (!rates) return undefined;
    return (e: Execution) => (e.executedAt ? rates[localDayKey(e.executedAt)] : undefined);
  }, [periodFxQuery.data]);
  const periodSummary = useMemo(
    () => summarizeExecutions(periodExecutions, holdingById, closedLotByExecutionId, periodRateForExecution),
    [periodExecutions, holdingById, closedLotByExecutionId, periodRateForExecution],
  );

  /** 프리셋/직접 지정 공통 — range 모드로 전환하고 달력 커서를 그 구간의 마지막
   * 달로 옮긴다. days 모드에서 골라둔 낱개 날짜는 건드리지 않는다(다시 달력을
   * 클릭하면 그대로 이어서 쓸 수 있다) — 다만 지금은 range 모드가 우선이라
   * 화면엔 반영되지 않는다. */
  function applyRange(range: DateRange) {
    setPeriodRange(range);
    setSelectionMode('range');
    const [endYear, endMonth] = range.end.split('-').map(Number);
    setCursor({ year: endYear, month: endMonth - 1 });
  }

  function applyPeriodPreset(preset: PeriodPreset) {
    setPeriodPreset(preset);
    if (preset === 'custom') return; // 사용자가 직접 입력할 때까지 대기
    const range = preset === 'all' ? dateRangeOf(executionsQuery.data ?? []) : presetRange(preset);
    if (range) applyRange(range);
  }

  /** 달력 날짜를 하나씩 토글 — days 모드로 전환한다. 프리셋과는 독립적이라, 방금
   * 프리셋으로 채운 화면이었어도 이 클릭 한 번으로 그 프리셋 결과는 뒤로 밀리고
   * 클릭한 날짜(들)만 보이게 된다 — 나머지를 일일이 해제할 필요가 없다. */
  function toggleDay(day: string) {
    setSelectionMode('days');
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  const periodLabel =
    selectionMode === 'days'
      ? selectedDays.size === 0
        ? '선택한 날짜 없음'
        : formatSelectedDays([...selectedDays].sort())
      : periodRange.start === periodRange.end
        ? periodRange.start
        : `${periodRange.start} ~ ${periodRange.end}`;

  // 종목 모드 — 선택한 종목과 같은 정체성(티커+지역)을 가진 holding_id 전부의
  // 체결을 합쳐서, 그 종목의 전체 이력(기초잔고 포함, 날짜 무관, 삭제된 뒤
  // 재매수한 분까지)을 한 번에 본다.
  const matchingHoldingIds = useMemo(() => {
    const key = groupKeyByHoldingId.get(selectedHoldingId);
    if (!key) return selectedHoldingId ? new Set([selectedHoldingId]) : new Set<string>();
    return new Set((holdingGroupsByKey.get(key) ?? []).map((h) => h.id));
  }, [selectedHoldingId, groupKeyByHoldingId, holdingGroupsByKey]);
  const holdingExecutions = useMemo(
    () => (executionsQuery.data ?? []).filter((e) => matchingHoldingIds.has(e.holdingId)),
    [executionsQuery.data, matchingHoldingIds],
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
    () =>
      [...holdingGroupsByKey.values()].map((group): HoldingComboItem => {
        const representative = pickRepresentativeHolding(group);
        return { value: representative.id, label: holdingOptionLabel(representative) };
      }),
    [holdingGroupsByKey],
  );
  // base-ui 콤보박스의 내장 필터링은 한글 조합 중엔 목록을 안 좁혀서 클릭으로
  // 엉뚱한 종목이 골라지는 버그가 있었다(useComboboxSearch 주석 참고) — 우회.
  const holdingSearch = useComboboxSearch(holdingComboItems, (item) => item.label);
  const holdingBuyNotes = useMemo(
    () => notesForSide(holdingExecutions, tradeNotes, 'BUY'),
    [holdingExecutions, tradeNotes],
  );
  const holdingSellNotes = useMemo(
    () => notesForSide(holdingExecutions, tradeNotes, 'SELL'),
    [holdingExecutions, tradeNotes],
  );

  // 우측 패널에 실제로 노출되는 범위 — range/days 어느 모드든 periodExecutions
  // 안에서만 필터가 동작한다. 종목 모드는 별도 레이아웃(holdingExecutions)을
  // 쓰므로 여기 관여하지 않는다.
  const filteredExecutions = useMemo(
    () => periodExecutions.filter((e) => matchesExecutionsFilter(e, filter, holdingById.get(e.holdingId))),
    [periodExecutions, filter, holdingById],
  );
  // 종목 필터 선택지도 지금 보고 있는 기간에 실제로 등장하는 종목으로만 좁힌다.
  const scopedHoldingOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of periodExecutions) {
      if (seen.has(e.holdingId)) continue;
      const h = holdingById.get(e.holdingId);
      if (h) seen.set(e.holdingId, h.ticker ? `${h.ticker} (${h.name})` : h.name);
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [periodExecutions, holdingById]);

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  /** shiftMonth와 달리 "오늘"은 순수 네비게이션이 아니라 "지금 이 순간을 보여줘"라는
   * 별도 액션이라 판단해, 달만 옮기지 않고 오늘 날짜로 선택도 교체한다(기존 선택에
   * 더하지 않음 — 눌렀을 때 정확히 오늘 것만 보이길 기대하기 때문). */
  function goToToday() {
    const t = new Date();
    setCursor({ year: t.getFullYear(), month: t.getMonth() });
    setSelectionMode('days');
    setSelectedDays(new Set([localDayKey(t.toISOString())]));
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

  /** 매매 모달의 섹터 콤보박스 "+ 새 섹터 만들기"에서 호출 — 목표% 0으로 만든다. */
  async function handleCreateSector(name: string) {
    const sortOrder = sectorCategoriesQuery.data?.length ?? 0;
    return addAxisCategory.mutateAsync({ axis: 'sector', name, description: null, targetPct: 0, sortOrder });
  }

  /** 매매 모달의 "변경" 링크 — 매매 저장과 무관하게 역할·섹터·레버리지만 바로 바꾼다. */
  async function handleUpdateHoldingClassification(input: {
    holdingId: string;
    roleId: Holding['roleId'];
    sectorId: string | null;
    leverage: number;
  }) {
    try {
      await updateHolding.mutateAsync({
        id: input.holdingId,
        patch: { roleId: input.roleId, sectorId: input.sectorId, leverage: input.leverage },
      });
    } catch (err) {
      console.error('Failed to update holding classification', err);
      toast.error('분류 저장에 실패했습니다.');
    }
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
    note: ExecutionNoteDraft | null;
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

    // note가 null이면 근거를 비워서 저장한 것 — 기존 근거 행을 지운다. undefined는
    // 없다: 수정 모드는 항상 textarea 내용대로 upsert/delete 둘 중 하나를 명시한다.
    try {
      if (note) {
        await upsertTradeNote.mutateAsync({ ...note, executionId: id });
      } else {
        await deleteTradeNote.mutateAsync(id);
      }
    } catch (err) {
      console.error('Failed to save trade note', err);
      toast.error('체결은 수정됐지만 근거 저장에 실패했습니다.');
    }
  }

  async function handleDelete(execution: Execution) {
    const holding = holdingById.get(execution.holdingId);
    if (!holding) return;
    try {
      await deleteExecution.mutateAsync({ holding, id: execution.id });
      toast.success('체결을 삭제했습니다. 이후 구간이 재계산됩니다.');
    } catch (err) {
      if (err instanceof OversoldError) {
        toast.error('이 체결을 지우면 보유 수량보다 많이 매도한 게 되어 삭제하지 않았습니다.');
        return;
      }
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
          <Button onClick={openAddDialog}>+ 매매 추가</Button>
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
      ) : viewMode === 'holding' ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <Combobox<HoldingComboItem>
              items={holdingComboItems}
              filteredItems={holdingSearch.filteredItems}
              value={holdingComboItems.find((i) => i.value === selectedHoldingId) ?? null}
              onValueChange={(item) => {
                setSelectedHoldingId(item?.value ?? '');
                holdingSearch.reset();
              }}
            >
              <ComboboxInput placeholder="종목 검색" className="w-full sm:w-80" {...holdingSearch.inputProps} />
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
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5 lg:w-90 lg:shrink-0">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[15px] font-semibold">
                {cursor.year}년 {cursor.month + 1}월
              </span>
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

            <div className="mb-3 flex flex-wrap gap-1.5">
              {(Object.keys(PERIOD_PRESET_LABELS) as Exclude<PeriodPreset, 'custom'>[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyPeriodPreset(preset)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    selectionMode === 'range' && periodPreset === preset
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
                  applyRange({ ...periodRange, start: e.target.value });
                }}
                className="font-mono text-xs"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <Input
                type="date"
                value={periodRange.end}
                onChange={(e) => {
                  setPeriodPreset('custom');
                  applyRange({ ...periodRange, end: e.target.value });
                }}
                className="font-mono text-xs"
              />
            </div>

            {/* 위 프리셋/직접 지정과는 독립적이다 — 날짜를 하나라도 클릭하면 그
                즉시 프리셋은 뒤로 밀리고(활성 표시가 꺼지고) 클릭한 날짜(들)만
                보이게 된다. 여러 날짜를 (연속이 아니어도, 여러 달에 걸쳐도) 계속
                눌러서 모아 볼 수 있다. */}
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
                const isSelected = selectionMode === 'days' && selectedDays.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleDay(key)}
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

            {hasActivity(periodSummary) && <TradeSummaryStrip summary={periodSummary} className="mt-3" fxLoading={periodFxQuery.isLoading} />}
          </div>

          {/* lg 이상에서는 달력과 나란히 두고 목록만 내부 스크롤한다 — 목록이 길어져도
              페이지 자체가 스크롤되면서 달력이 화면 밖으로 밀려나지 않게 하기 위해서다.
              높이 값은 상단 네비게이션 + 페이지 헤더가 차지하는 대략적인 여백을 뺀 값이다. */}
          <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-card p-4 sm:p-5 lg:max-h-[calc(100vh-220px)]">
            <div className="mb-3 shrink-0">
              <div className="text-[13px] font-semibold">
                {periodLabel} 체결 <span className="font-normal text-muted-foreground">({periodExecutions.length}건)</span>
              </div>
            </div>
            {periodExecutions.length > 0 && (
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
      )}

      <ExecutionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        holdings={holdings}
        executions={executionsQuery.data ?? []}
        tradeNotes={tradeNotes}
        roles={roleCategoriesQuery.data ?? []}
        sectors={sectorCategoriesQuery.data ?? []}
        onCreateSector={handleCreateSector}
        onUpdateHoldingClassification={handleUpdateHoldingClassification}
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
            onEdit={openEditDialog}
            onDelete={setDeleteTarget}
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
