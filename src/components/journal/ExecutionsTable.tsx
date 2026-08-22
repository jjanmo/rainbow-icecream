import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { OpeningBalanceBadge } from '@/components/journal/OpeningBalanceBadge';
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

function byExecutedAtThenId(a: Row, b: Row): number {
  return a.execution.executedAt.localeCompare(b.execution.executedAt) || a.execution.id.localeCompare(b.execution.id);
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

/** 로컬 시간대 'MM/DD HH:mm'. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ExecutionsTable({
  executions,
  holdingById,
  closedLotByExecutionId,
  rateForExecution,
  onRowClick,
}: {
  executions: Execution[];
  holdingById: Map<string, Holding>;
  closedLotByExecutionId: Map<string, ClosedLot>;
  rateForExecution?: (execution: Execution) => number | undefined;
  onRowClick: (execution: Execution) => void;
}) {
  const [sort, setSort] = useState<SortState | null>(null);

  const rows = useMemo(
    () => executions.map((e) => buildRow(e, holdingById.get(e.holdingId), closedLotByExecutionId.get(e.id), rateForExecution)),
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
          <TableHead>
            <SortableHeaderLabel label="날짜" sortKey="executedAt" sort={sort} onSort={handleSort} />
          </TableHead>
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
          <TableHead className="text-right">
            <SortableHeaderLabel label="실현손익" sortKey="realizedPnl" sort={sort} onSort={handleSort} />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedRows.map(({ execution: e, holding, closedLot, grossAmount, krwRate }) => {
          const currency = holding ? currencyOf(holding.region) : 'KRW';
          const fmt = (n: number) => (currency === 'USD' ? fmtUsd(n) : fmtWon(n));
          const isBuy = e.side === 'BUY';
          return (
            <TableRow key={e.id} className="cursor-pointer" onClick={() => onRowClick(e)}>
              <TableCell className="text-xs text-muted-foreground">{formatDateTime(e.executedAt)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <span
                    className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                    style={{ color: isBuy ? 'var(--diff-rise)' : 'var(--diff-fall)' }}
                  >
                    {isBuy ? '매수' : '매도'}
                  </span>
                  {e.intent === 'OPENING_BALANCE' && <OpeningBalanceBadge />}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-[13px] font-semibold">{holding?.name ?? '삭제된 종목'}</div>
                {holding?.ticker && <div className="font-mono text-[11px] text-muted-foreground">{holding.ticker}</div>}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{fmtQty(e.qty)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{fmt(e.price)}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {fmt(grossAmount)}
                {currency === 'USD' && (
                  <div className="text-[11px] text-muted-foreground">
                    {krwRate !== undefined ? `≈ ${fmtWon(grossAmount * krwRate)}` : '환율 조회 중...'}
                  </div>
                )}
              </TableCell>
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
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
