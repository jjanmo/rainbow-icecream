import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { actionColor, actionLabel, diffColor, REBALANCE_THRESHOLD, type GroupCalc } from '@/lib/calc/rebalance';
import { fmtPct, fmtSigned, fmtWon } from '@/lib/format';

// Explicit widths so the 리밸런싱 column fits without widening the table —
// 자산군 gives up the space (its name truncates) rather than the numbers.
const COLUMNS = [
  { key: 'group', label: '자산군', width: 140, align: 'left' as const },
  { key: 'target', label: '목표', width: 80, align: 'right' as const },
  { key: 'actual', label: '실제', width: 80, align: 'right' as const },
  { key: 'diff', label: '차이', width: 90, align: 'right' as const },
  { key: 'value', label: '평가금', width: 120, align: 'right' as const },
  { key: 'action', label: '리밸런싱', width: 112, align: 'right' as const },
  { key: 'amount', label: '조정 금액', width: 130, align: 'right' as const },
];

/** Click-to-toggle explainer for the 리밸런싱 column: what decides 유지 vs
 * 매수/매도 필요. Each verdict is printed in its own actionColor so the popover
 * doubles as the legend for the table's colors. */
function RebalanceCriteriaHint() {
  const verdicts = [
    { diff: 0, label: '유지', detail: `차이가 ±${REBALANCE_THRESHOLD}%p 안` },
    { diff: REBALANCE_THRESHOLD, label: '매도 필요', detail: `실제가 목표보다 ${REBALANCE_THRESHOLD}%p 이상 높음` },
    { diff: -REBALANCE_THRESHOLD, label: '매수 필요', detail: `실제가 목표보다 ${REBALANCE_THRESHOLD}%p 이상 낮음` },
  ];

  return (
    <Popover>
      <PopoverTrigger
        aria-label="리밸런싱 판정 기준 보기"
        className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-[10px] leading-none font-normal text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
      >
        ?
      </PopoverTrigger>
      <PopoverContent align="end" className="w-66 text-left">
        <PopoverHeader>
          <PopoverTitle className="text-[13px]">리밸런싱 판정 기준</PopoverTitle>
          <PopoverDescription className="text-xs leading-relaxed">
            목표 비중과 실제 비중의 차이가 {REBALANCE_THRESHOLD}%p 이상 벌어진 자산군만 조치 대상으로 봅니다.
          </PopoverDescription>
        </PopoverHeader>
        <ul className="flex flex-col gap-1 text-xs">
          {verdicts.map((v) => (
            <li key={v.label} className="flex gap-1.5">
              <span className="w-14 shrink-0 font-semibold" style={{ color: actionColor(v.diff) }}>
                {v.label}
              </span>
              <span className="text-muted-foreground">{v.detail}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Asset-group level only — targets are set per group, never per holding,
 * so a holding has no target to be compared against (ADR-0024). */
export function RebalanceTable({ rows }: { rows: GroupCalc[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table className="min-w-190 table-fixed">
        <colgroup>
          {COLUMNS.map((col) => (
            <col key={col.key} style={{ width: col.width }} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((col, i) => (
              <TableHead
                key={col.key}
                className={`${col.align === 'right' ? 'text-right' : ''} ${i === 0 ? 'pl-4' : ''} ${
                  i === COLUMNS.length - 1 ? 'pr-4' : ''
                }`}
              >
                {col.key === 'action' ? (
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <RebalanceCriteriaHint />
                  </span>
                ) : (
                  col.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((g) => (
            <TableRow key={g.id}>
              <TableCell className="pl-4">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="truncate font-semibold">{g.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{g.members.length}종목</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono">{fmtPct(g.targetPct)}</TableCell>
              <TableCell className="text-right font-mono">{fmtPct(g.actualPct)}</TableCell>
              <TableCell className="text-right font-mono font-semibold" style={{ color: diffColor(g.diff) }}>
                {fmtSigned(g.diff)}p
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">{fmtWon(g.value)}</TableCell>
              <TableCell className="text-right font-semibold" style={{ color: actionColor(g.diff) }}>
                {actionLabel(g.diff)}
              </TableCell>
              {/* Unsigned on purpose: the 리밸런싱 column immediately to the left
                  already says whether this is 매수 or 매도. */}
              <TableCell className="pr-4 text-right font-mono" style={{ color: actionColor(g.diff) }}>
                {fmtWon(Math.abs(g.actionAmount))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
