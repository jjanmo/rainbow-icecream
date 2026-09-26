import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { returnColor, type HoldingCalc } from '@/lib/calc/rebalance';
import { fmtSigned, fmtWon } from '@/lib/format';
import { ASSET_TYPE_LABELS, type Holding } from '@/types/domain';
import { HoldingsTableRow } from './HoldingsTableRow';

type SortableKey = 'name' | 'role' | 'sector' | 'account' | 'qty' | 'avgPrice' | 'price' | 'value' | 'return' | 'assetType';

interface ColumnDef {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'right';
  sortKey?: SortableKey;
}

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: '종목', width: 170, align: 'left', sortKey: 'name' },
  { key: 'role', label: '역할', width: 70, align: 'left', sortKey: 'role' },
  { key: 'sector', label: '섹터', width: 110, align: 'left', sortKey: 'sector' },
  { key: 'assetType', label: '자산종류', width: 90, align: 'left', sortKey: 'assetType' },
  { key: 'accountRegion', label: '계좌·지역', width: 90, align: 'left', sortKey: 'account' },
  { key: 'qty', label: '수량', width: 70, align: 'right', sortKey: 'qty' },
  { key: 'avgPrice', label: '평균매입가', width: 90, align: 'right', sortKey: 'avgPrice' },
  { key: 'price', label: '현재가', width: 100, align: 'right', sortKey: 'price' },
  { key: 'value', label: '평가금액', width: 100, align: 'right', sortKey: 'value' },
  { key: 'return', label: '수익률', width: 70, align: 'right', sortKey: 'return' },
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
  roleNameById: Map<string, string>,
  sectorNameById: Map<string, string>,
): number {
  if (!sort) return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  const dir = sort.dir === 'asc' ? 1 : -1;
  switch (sort.key) {
    case 'name':
      return a.name.localeCompare(b.name, 'ko') * dir;
    case 'role':
      return (
        (a.roleId ? (roleNameById.get(a.roleId) ?? '') : '').localeCompare(
          b.roleId ? (roleNameById.get(b.roleId) ?? '') : '',
          'ko',
        ) * dir
      );
    case 'sector':
      return (
        (a.sectorId ? (sectorNameById.get(a.sectorId) ?? '') : '').localeCompare(
          b.sectorId ? (sectorNameById.get(b.sectorId) ?? '') : '',
          'ko',
        ) * dir
      );
    case 'account':
      return (a.account ?? '').localeCompare(b.account ?? '', 'ko') * dir;
    case 'qty':
      return (a.qty - b.qty) * dir;
    case 'avgPrice':
      return (a.avgPrice - b.avgPrice) * dir;
    case 'price':
      return (a.priceKrw - b.priceKrw) * dir;
    case 'value':
      return (a.value - b.value) * dir;
    case 'return':
      return (a.returnPct - b.returnPct) * dir;
    case 'assetType':
      return (
        (a.assetType ? ASSET_TYPE_LABELS[a.assetType] : '').localeCompare(
          b.assetType ? ASSET_TYPE_LABELS[b.assetType] : '',
          'ko',
        ) * dir
      );
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
  roleNameById,
  sectorNameById,
  onEdit,
  onDelete,
}: {
  rows: HoldingCalc[];
  /** For converting 해외 종목의 평균매입가(달러)를 원화 취득원가로 — 총 수익률
   * 계산에만 쓴다. 실시간 환율이라 평가금액과 같은 성격의 값이다(ADR-0029/0038이
   * 지킨 "환율은 평가금액에만" 경계와 일관됨 — 실현손익에는 안 쓴다). */
  usdKrwRate: number;
  /** 역할 id → 이름 (ADR-0063, 역할도 동적 목록이라 고정 라벨 맵이 없다). */
  roleNameById: Map<string, string>;
  /** 섹터 id → 이름 (ADR-0062, 역할/섹터는 이제 종목 컬럼에 항상 고정으로 뜬다). */
  sectorNameById: Map<string, string>;
  onEdit: (holding: Holding) => void;
  onDelete: (id: string) => void;
}) {
  const [sort, setSort] = useState<SortState | null>(null);
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareHoldings(a, b, sort, roleNameById, sectorNameById)),
    [rows, sort, roleNameById, sectorNameById],
  );

  const totalValue = rows.reduce((sum, h) => sum + h.value, 0);
  const totalCostKrw = rows.reduce(
    (sum, h) => sum + h.qty * h.avgPrice * (h.nativeCurrency === 'USD' ? usdKrwRate : 1),
    0,
  );
  const totalReturnPct = totalCostKrw > 0 ? ((totalValue - totalCostKrw) / totalCostKrw) * 100 : 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table className="table-fixed">
        <colgroup>
          {COLUMNS.map((col) => (
            <col key={col.key} style={{ width: col.width }} />
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
              roleNameById={roleNameById}
              sectorNameById={sectorNameById}
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
                if (col.key === 'value') {
                  return (
                    <TableCell key={col.key} className="text-right font-mono font-semibold">
                      {fmtWon(totalValue)}
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
