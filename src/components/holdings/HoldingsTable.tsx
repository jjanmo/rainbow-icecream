import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { drawdownFrom52wHigh, type Drawdown52w } from '@/lib/calc/high52w';
import { costKrwOf, returnColor, type HoldingCalc } from '@/lib/calc/rebalance';
import type { High52w } from '@/lib/toss/tossHigh52wProvider';
import { fmtSigned, fmtWon } from '@/lib/format';
import type { Holding } from '@/types/domain';
import { HoldingsTableRow } from './HoldingsTableRow';

type SortableKey = 'name' | 'qty' | 'avgPrice' | 'price' | 'cost' | 'value' | 'return' | 'drawdown';

interface ColumnDef {
  key: string;
  label: string;
  /** 고정 너비(px). 비워 두면 고정 열을 뺀 나머지 폭을 다른 비고정 열과 똑같이 나눠 갖는다
   * (table-fixed 규칙) — 화면이 넓어질 때 종목 칸만 비대해지지 않도록 숫자 열이 여유 폭을
   * 흡수하게 한다. */
  width?: number;
  align: 'left' | 'right';
  sortKey?: SortableKey;
}

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: '종목', width: 160, align: 'left', sortKey: 'name' },
  { key: 'qty', label: '수량', align: 'right', sortKey: 'qty' },
  { key: 'avgPrice', label: '평균매입가', align: 'right', sortKey: 'avgPrice' },
  { key: 'price', label: '현재가', align: 'right', sortKey: 'price' },
  { key: 'cost', label: '매입금액', align: 'right', sortKey: 'cost' },
  { key: 'value', label: '평가금액', align: 'right', sortKey: 'value' },
  { key: 'return', label: '수익률', align: 'right', sortKey: 'return' },
  { key: 'drawdown', label: '52주 고점 대비', align: 'right', sortKey: 'drawdown' },
  { key: 'plan', label: '매매 계획', width: 150, align: 'right' },
  { key: 'actions', label: '', width: 70, align: 'right' },
];

interface SortState {
  key: SortableKey;
  dir: 'asc' | 'desc';
}

/** 헤더를 클릭할 때마다 오름차순 → 내림차순 → 기본값(등록순) 순으로 돈다. 서버에
 * 저장하지 않는, 이 테이블만의 보기 상태다. */
function nextSort(current: SortState | null, key: SortableKey): SortState | null {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;
}

/** 정렬을 고르지 않았을 때(기본값)는 항상 등록(최초 생성) 순 — 설정 화면의 드래그
 * 순서(sort_order)와는 무관하다(ADR-0025가 색상에 쓴 것과 같은 기준). */
function compareHoldings(
  a: HoldingCalc,
  b: HoldingCalc,
  sort: SortState | null,
  usdKrwRate: number,
  drawdownById: Map<string, Drawdown52w | null>,
): number {
  if (!sort) return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  const dir = sort.dir === 'asc' ? 1 : -1;
  switch (sort.key) {
    case 'name':
      return a.name.localeCompare(b.name, 'ko') * dir;
    case 'qty':
      return (a.qty - b.qty) * dir;
    case 'avgPrice':
      return (a.avgPrice - b.avgPrice) * dir;
    case 'price':
      return (a.priceKrw - b.priceKrw) * dir;
    case 'cost':
      return (costKrwOf(a, usdKrwRate) - costKrwOf(b, usdKrwRate)) * dir;
    case 'drawdown': {
      // 값이 없는 종목(현금성·조회 실패·로딩 중)은 방향과 무관하게 항상 맨 뒤로 보낸다.
      const da = drawdownById.get(a.id)?.drawdownPct;
      const db = drawdownById.get(b.id)?.drawdownPct;
      if (da == null || db == null) return (da == null ? 1 : 0) - (db == null ? 1 : 0);
      return (da - db) * dir;
    }
    case 'value':
      return (a.value - b.value) * dir;
    case 'return':
      return (a.returnPct - b.returnPct) * dir;
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
      className={`inline-flex items-center gap-0.5 hover:text-foreground ${
        dir ? 'text-foreground' : 'text-muted-foreground'
      }`}
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

export function HoldingsTable({
  rows,
  usdKrwRate,
  high52wByTicker,
  high52wLoading,
  onEdit,
  onDelete,
}: {
  rows: HoldingCalc[];
  /** For converting 해외 종목의 평균매입가(달러)를 원화 취득원가로 — 총 수익률
   * 계산에만 쓴다. 실시간 환율이라 평가금액과 같은 성격의 값이다(ADR-0029/0038이
   * 지킨 "환율은 평가금액에만" 경계와 일관됨 — 실현손익에는 안 쓴다). */
  usdKrwRate: number;
  /** 티커 → 캐시된 52주 장중 고가 (ADR-0065). 조회 실패한 티커는 없다. */
  high52wByTicker: Record<string, High52w> | undefined;
  high52wLoading: boolean;
  onEdit: (holding: Holding) => void;
  onDelete: (id: string) => void;
}) {
  const [sort, setSort] = useState<SortState | null>(null);
  const drawdownById = useMemo(
    () =>
      new Map(
        rows.map((h) => [
          h.id,
          h.ticker ? drawdownFrom52wHigh(high52wByTicker?.[h.ticker], h.priceNative, h.hasLivePrice) : null,
        ]),
      ),
    [rows, high52wByTicker],
  );
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareHoldings(a, b, sort, usdKrwRate, drawdownById)),
    [rows, sort, usdKrwRate, drawdownById],
  );

  const totalValue = rows.reduce((sum, h) => sum + h.value, 0);
  const totalCostKrw = rows.reduce((sum, h) => sum + costKrwOf(h, usdKrwRate), 0);
  const totalReturnPct = totalCostKrw > 0 ? ((totalValue - totalCostKrw) / totalCostKrw) * 100 : 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      {/* 최소 폭 = 고정 열(종목 160 + 매매 계획 150 + 버튼 70) + 숫자 열 7개 × 100 — 좁은
          화면에서 숫자 열이 그 아래로 찌그러지는 대신 가로 스크롤된다. */}
      <Table className="min-w-[1080px] table-fixed">
        <colgroup>
          {COLUMNS.map((col) => (
            <col key={col.key} style={col.width ? { width: col.width } : undefined} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((col) => (
              <TableHead key={col.key} className={col.align === 'right' ? 'text-right' : undefined}>
                {col.sortKey ? (
                  <SortableHeaderLabel
                    label={col.label}
                    sortKey={col.sortKey}
                    sort={sort}
                    onSort={(key) => setSort((cur) => nextSort(cur, key))}
                  />
                ) : (
                  col.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((holding) => (
            <HoldingsTableRow
              key={holding.id}
              holding={holding}
              usdKrwRate={usdKrwRate}
              drawdown={drawdownById.get(holding.id) ?? null}
              drawdownLoading={high52wLoading && !!holding.ticker}
              onEdit={() => onEdit(holding)}
              onDelete={() => onDelete(holding.id)}
            />
          ))}
        </TableBody>
        {rows.length > 0 && (
          <TableFooter>
            <TableRow>
              {COLUMNS.map((col) => {
                if (col.key === 'name') {
                  return (
                    <TableCell key={col.key} className="font-semibold">
                      합계
                    </TableCell>
                  );
                }
                if (col.key === 'cost' || col.key === 'value') {
                  return (
                    <TableCell key={col.key} className="text-right font-mono font-semibold">
                      {fmtWon(col.key === 'cost' ? totalCostKrw : totalValue)}
                    </TableCell>
                  );
                }
                if (col.key === 'return') {
                  return (
                    <TableCell
                      key={col.key}
                      className="text-right font-mono font-semibold"
                      style={{ color: returnColor(totalReturnPct) }}
                    >
                      {fmtSigned(totalReturnPct)}
                    </TableCell>
                  );
                }
                return <TableCell key={col.key} />;
              })}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
