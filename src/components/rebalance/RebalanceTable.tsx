import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { actionLabel, diffColor, type HoldingCalc } from '@/lib/calc/rebalance';
import { fmtPct, fmtSigned, fmtWon } from '@/lib/format';

export function RebalanceTable({ rows }: { rows: HoldingCalc[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table className="min-w-190">
        <TableHeader>
          <TableRow>
            <TableHead>종목</TableHead>
            <TableHead>자산군</TableHead>
            <TableHead className="text-right">전체목표%</TableHead>
            <TableHead className="text-right">전체실제%</TableHead>
            <TableHead className="text-right">차이</TableHead>
            <TableHead className="text-right">조치 필요액</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((h) => (
            <TableRow key={h.id}>
              <TableCell>
                <div className="font-semibold">{h.name}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{h.ticker}</div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <div className="size-2 shrink-0 rounded-full" style={{ background: h.groupColor }} />
                  {h.groupName}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono">{fmtPct(h.targetPct)}</TableCell>
              <TableCell className="text-right font-mono">{fmtPct(h.actualPct)}</TableCell>
              <TableCell className="text-right font-mono font-semibold" style={{ color: diffColor(h.diff) }}>
                {fmtSigned(h.diff)}p
              </TableCell>
              <TableCell className="text-right">
                <span className="font-semibold" style={{ color: diffColor(h.diff) }}>
                  {actionLabel(h.diff)}
                </span>{' '}
                <span className="font-mono text-muted-foreground">{fmtWon(Math.abs(h.actionAmount))}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
