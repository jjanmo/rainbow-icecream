import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { actionLabel, diffColor, type GroupCalc } from '@/lib/calc/rebalance';
import { fmtPct, fmtSigned, fmtWon } from '@/lib/format';

/** Asset-group level only — targets are set per group, never per holding,
 * so a holding has no target to be compared against (ADR-0024). */
export function RebalanceTable({ rows }: { rows: GroupCalc[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table className="min-w-190">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">자산군</TableHead>
            <TableHead className="text-right">목표%</TableHead>
            <TableHead className="text-right">실제%</TableHead>
            <TableHead className="text-right">차이</TableHead>
            <TableHead className="text-right">평가금액</TableHead>
            <TableHead className="pr-4 text-right">조치 필요액</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((g) => (
            <TableRow key={g.id}>
              <TableCell className="pl-4">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-[11px] text-muted-foreground">{g.members.length}종목</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono">{fmtPct(g.targetPct)}</TableCell>
              <TableCell className="text-right font-mono">{fmtPct(g.actualPct)}</TableCell>
              <TableCell className="text-right font-mono font-semibold" style={{ color: diffColor(g.diff) }}>
                {fmtSigned(g.diff)}p
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">{fmtWon(g.value)}</TableCell>
              <TableCell className="pr-4 text-right">
                <span className="font-semibold" style={{ color: diffColor(g.diff) }}>
                  {actionLabel(g.diff)}
                </span>{' '}
                <span className="font-mono text-muted-foreground">{fmtWon(Math.abs(g.actionAmount))}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
