import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { costKrwOf, returnColor, type HoldingCalc } from "@/lib/calc/rebalance";
import { fmtQty, fmtSigned, fmtUsd, fmtWon } from "@/lib/format";
import { FitText } from "./FitText";

export function HoldingsTableRow({
  holding,
  usdKrwRate,
  onEdit,
  onDelete,
}: {
  holding: HoldingCalc;
  /** 해외 종목의 투입 원가를 원화로 바꿔 매입금액 열에 쓴다 — 표 하단 총 매입금액과
   * 같은 실시간 환율이다. */
  usdKrwRate: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isOverseas = holding.nativeCurrency === "USD";
  const costKrw = costKrwOf(holding, usdKrwRate);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <div className="min-w-0">
            <FitText className="font-semibold">{holding.name}</FitText>
            <FitText className="font-mono text-muted-foreground">{holding.ticker || " "}</FitText>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <FitText className="font-mono">{fmtQty(holding.qty)}</FitText>
      </TableCell>
      <TableCell className="text-right">
        <FitText className="font-mono">{isOverseas ? fmtUsd(holding.avgPrice) : fmtWon(holding.avgPrice)}</FitText>
      </TableCell>
      <TableCell className="text-right">
        <FitText className={`font-mono ${holding.hasLivePrice ? "" : "text-muted-foreground"}`}>
          {fmtWon(holding.priceKrw)}
        </FitText>
        {isOverseas && (
          <FitText className="font-mono text-muted-foreground">{fmtUsd(holding.priceNative)}</FitText>
        )}
      </TableCell>
      <TableCell className="text-right">
        <FitText className="font-mono">{fmtWon(costKrw)}</FitText>
        {isOverseas && (
          <FitText className="font-mono text-muted-foreground">{fmtUsd(holding.qty * holding.avgPrice)}</FitText>
        )}
      </TableCell>
      <TableCell className="text-right">
        <FitText className="font-mono">{fmtWon(holding.value)}</FitText>
        {isOverseas && (
          <FitText className="font-mono text-muted-foreground">{fmtUsd(holding.valueNative)}</FitText>
        )}
      </TableCell>
      <TableCell className="text-right">
        <FitText className="font-mono font-semibold" style={{ color: returnColor(holding.returnPct) }}>
          {fmtSigned(holding.returnPct)}
        </FitText>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-0.5">
          <Button variant="ghost" size="icon-xs" onClick={onEdit} className="text-muted-foreground">
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onDelete} className="text-muted-foreground">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
