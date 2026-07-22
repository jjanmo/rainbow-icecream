import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { HoldingCalc } from '@/lib/calc/rebalance';
import type { Holding } from '@/types/domain';
import { HoldingsTableRow } from './HoldingsTableRow';

export const COLUMNS = [
  { key: 'name', label: '종목', width: 170, align: 'left' as const },
  { key: 'group', label: '자산군', width: 90, align: 'left' as const },
  { key: 'accountRegion', label: '계좌·구분', width: 90, align: 'left' as const },
  { key: 'qty', label: '수량', width: 70, align: 'right' as const },
  { key: 'avgPrice', label: '평균매입가', width: 90, align: 'right' as const },
  { key: 'price', label: '현재가', width: 100, align: 'right' as const },
  { key: 'value', label: '평가금액', width: 100, align: 'right' as const },
  { key: 'return', label: '수익률', width: 70, align: 'right' as const },
  { key: 'memo', label: '비고', width: 180, align: 'left' as const },
  { key: 'actions', label: '', width: 70, align: 'right' as const },
];

export function HoldingsTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: HoldingCalc[];
  onEdit: (holding: Holding) => void;
  onDelete: (id: string) => void;
}) {
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
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((holding) => (
            <HoldingsTableRow
              key={holding.id}
              holding={holding}
              onEdit={() => onEdit(holding)}
              onDelete={() => onDelete(holding.id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
