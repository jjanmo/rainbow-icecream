import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { returnColor, type HoldingCalc } from "@/lib/calc/rebalance";
import { fmtQty, fmtSigned, fmtUsd, fmtWon } from "@/lib/format";
import { FitText } from "./FitText";

export function HoldingsTableRow({
  holding,
  onEdit,
  onDelete,
}: {
  holding: HoldingCalc;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isOverseas = holding.nativeCurrency === "USD";

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <div className="size-2.5 shrink-0 rounded-full" style={{ background: holding.color }} />
          <div className="min-w-0">
            <FitText className="font-semibold">{holding.name}</FitText>
            <FitText className="font-mono text-muted-foreground">{holding.ticker || " "}</FitText>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <div className="size-2 shrink-0 rounded-full" style={{ background: holding.groupColor }} />
          <FitText>{holding.groupName}</FitText>
        </div>
      </TableCell>
      <TableCell>
        <FitText>{holding.account || "-"}</FitText>
        <FitText className="text-muted-foreground">{holding.region}</FitText>
      </TableCell>
      <TableCell className="text-right">
        <FitText className="font-mono">{fmtQty(holding.qty)}</FitText>
      </TableCell>
      <TableCell className="text-right">
        <FitText className="font-mono">{fmtWon(holding.avgPrice)}</FitText>
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
      <TableCell>
        <FitText className="text-muted-foreground">{holding.memo || "-"}</FitText>
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
