import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { returnColor } from '@/lib/calc/rebalance';
import { computeExecutionAmount, currencyOf } from '@/lib/journal/cost';
import type { ClosedLot } from '@/lib/journal/replay';
import { fmtQty, fmtUsd, fmtWon } from '@/lib/format';
import type { Execution } from '@/types/journal';
import type { Holding } from '@/types/domain';

type SortableKey = 'executedAt' | 'name' | 'side' | 'amount' | 'realizedPnl';

interface SortState {
  key: SortableKey;
  dir: 'asc' | 'desc';
}

/** 헤더를 클릭할 때마다 오름차순 → 내림차순 → 기본값(시간순) 순으로 돈다. 서버에
 * 저장하지 않는, 이 테이블만의 보기 상태다. */
function nextSort(current: SortState | null, key: SortableKey): SortState | null {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;
}

interface Row {
  execution: Execution;
  holding: Holding | undefined;
  closedLot: ClosedLot | undefined;
  grossAmount: number;
  krwRate: number | undefined;
  /** 정렬용 — 국내는 그대로, 해외는 체결일 환율로 환산(못 구하면 원래 통화 숫자를 그대로 써서 완전히 밀려나지 않게만 한다). */
  amountKrw: number;
  pnlKrw: number;
}

function buildRow(
  execution: Execution,
  holding: Holding | undefined,
  closedLot: ClosedLot | undefined,
  rateForExecution?: (execution: Execution) => number | undefined,
): Row {
  const { grossAmount, currency } = computeExecutionAmount({
    side: execution.side,
    qty: execution.qty,
    price: execution.price,
    region: holding?.region ?? '국내',
  });
  const krwRate = currency === 'USD' ? rateForExecution?.(execution) : undefined;
  const amountKrw = currency === 'USD' ? (krwRate ?? 1) * grossAmount : grossAmount;
  const pnl = closedLot?.realizedPnl ?? 0;
  const pnlKrw = currency === 'USD' ? (krwRate ?? 1) * pnl : pnl;
  return { execution, holding, closedLot, grossAmount, krwRate, amountKrw, pnlKrw };
}

/** 기초잔고는 날짜가 없다(ADR-0048) — 개념상 가장 이른 시점이므로 맨 앞으로 보낸다. */
function byExecutedAtThenId(a: Row, b: Row): number {
  return (
    (a.execution.executedAt ?? '').localeCompare(b.execution.executedAt ?? '') ||
    a.execution.id.localeCompare(b.execution.id)
  );
}

function compareRows(a: Row, b: Row, sort: SortState | null): number {
  if (!sort) return byExecutedAtThenId(a, b);
  const dir = sort.dir === 'asc' ? 1 : -1;
  switch (sort.key) {
    case 'executedAt':
      return byExecutedAtThenId(a, b) * dir;
    case 'name':
      return (a.holding?.name ?? '').localeCompare(b.holding?.name ?? '', 'ko') * dir;
    case 'side':
      return a.execution.side.localeCompare(b.execution.side) * dir;
    case 'amount':
      return (a.amountKrw - b.amountKrw) * dir;
    case 'realizedPnl':
      return (a.pnlKrw - b.pnlKrw) * dir;
  }
}

function SortableHeaderLabel({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortableKey;
  sort: SortState | null;
  onSort: (key: SortableKey) => void;
}) {
  const dir = sort && sort.key === sortKey ? sort.dir : null;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-0.5 hover:text-foreground ${dir ? 'text-foreground' : 'text-muted-foreground'}`}
    >
      {label}
      {dir === 'asc' ? (
        <ArrowUp className="size-3" />
      ) : dir === 'desc' ? (
        <ArrowDown className="size-3" />
      ) : (
        <ArrowUpDown className="size-3 opacity-40" />
      )}
    </button>
  );
}

/** 로컬 시간대 'MM/DD HH:mm'. 기초잔고(날짜 없음, ADR-0048)는 대시로 표시한다. */
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ExecutionsTable({
  executions,
  holdingById,
  closedLotByExecutionId,
  rateForExecution,
  onEdit,
  onDelete,
  showDateColumn = true,
  showRealizedPnlColumn = true,
}: {
  executions: Execution[];
  holdingById: Map<string, Holding>;
  closedLotByExecutionId: Map<string, ClosedLot>;
  rateForExecution?: (execution: Execution) => number | undefined;
  onEdit: (execution: Execution) => void;
  onDelete: (execution: Execution) => void;
  /** 기초잔고 목록(ADR-0048, 날짜가 없다)처럼 날짜가 의미 없는 맥락에서는 꺼서 열 자체를 없앤다. */
  showDateColumn?: boolean;
  /** 기초잔고는 그 자체가 매도된 적 없는 시작점이라 실현손익이 항상 비어 있다 — 같은 이유로 끌 수 있다. */
  showRealizedPnlColumn?: boolean;
}) {
  const [sort, setSort] = useState<SortState | null>(null);

  const rows = useMemo(
    () =>
      executions.map((e) =>
        buildRow(e, holdingById.get(e.holdingId), closedLotByExecutionId.get(e.id), rateForExecution),
      ),
    [executions, holdingById, closedLotByExecutionId, rateForExecution],
  );
  const sortedRows = useMemo(() => [...rows].sort((a, b) => compareRows(a, b, sort)), [rows, sort]);
  const handleSort = (key: SortableKey) => setSort((c) => nextSort(c, key));

  if (executions.length === 0) {
    return <p className="text-xs text-muted-foreground">조건에 맞는 체결이 없습니다.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showDateColumn && (
            <TableHead>
              <SortableHeaderLabel label="날짜" sortKey="executedAt" sort={sort} onSort={handleSort} />
            </TableHead>
          )}
          <TableHead>
            <SortableHeaderLabel label="구분" sortKey="side" sort={sort} onSort={handleSort} />
          </TableHead>
          <TableHead>
            <SortableHeaderLabel label="종목" sortKey="name" sort={sort} onSort={handleSort} />
          </TableHead>
          <TableHead className="text-right">수량</TableHead>
          <TableHead className="text-right">단가</TableHead>
          <TableHead className="text-right">
            <SortableHeaderLabel label="총액" sortKey="amount" sort={sort} onSort={handleSort} />
          </TableHead>
          {showRealizedPnlColumn && (
            <TableHead className="text-right">
              <SortableHeaderLabel label="실현손익" sortKey="realizedPnl" sort={sort} onSort={handleSort} />
            </TableHead>
          )}
          <TableHead className="text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedRows.map(({ execution: e, holding, closedLot, grossAmount, krwRate }) => {
          const currency = holding ? currencyOf(holding.region) : 'KRW';
          const fmt = (n: number) => (currency === 'USD' ? fmtUsd(n) : fmtWon(n));
          const isBuy = e.side === 'BUY';
          return (
            <TableRow key={e.id}>
              {showDateColumn && (
                <TableCell className="text-xs text-muted-foreground">{formatDateTime(e.executedAt)}</TableCell>
              )}
              <TableCell>
                <span
                  className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                  style={{ color: isBuy ? 'var(--diff-rise)' : 'var(--diff-fall)' }}
                >
                  {isBuy ? '매수' : '매도'}
                </span>
              </TableCell>
              <TableCell>
                <div className="text-[13px] font-semibold">{holding?.name ?? '삭제된 종목'}</div>
                {holding?.ticker && <div className="font-mono text-[11px] text-muted-foreground">{holding.ticker}</div>}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{fmtQty(e.qty)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{fmt(e.price)}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {fmt(grossAmount)}
                {/* rateForExecution이 아예 안 넘어온 맥락(기초잔고 목록 — 날짜가 없어
                    환율을 조회할 대상 자체가 없다, ADR-0048)에서는 "조회 중"이라고
                    거짓 안내하지 않고 그냥 원래 통화 금액만 보여준다. */}
                {currency === 'USD' && rateForExecution && (
                  <div className="text-[11px] text-muted-foreground">
                    {krwRate !== undefined ? `≈ ${fmtWon(grossAmount * krwRate)}` : '환율 조회 중...'}
                  </div>
                )}
              </TableCell>
              {showRealizedPnlColumn && (
                <TableCell className="text-right font-mono text-xs">
                  {closedLot ? (
                    <span className="font-semibold" style={{ color: returnColor(closedLot.realizedPnl) }}>
                      {closedLot.realizedPnl >= 0 ? '+' : ''}
                      {fmt(closedLot.realizedPnl)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-0.5">
                  <Button variant="ghost" size="icon-xs" onClick={() => onEdit(e)} className="text-muted-foreground">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => onDelete(e)} className="text-muted-foreground">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
