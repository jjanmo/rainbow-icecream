import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { returnColor, type HoldingCalc } from "@/lib/calc/rebalance";
import { fmtQty, fmtSigned, fmtUsd, fmtWon } from "@/lib/format";
import { ASSET_TYPE_LABELS } from "@/types/domain";
import { FitText } from "./FitText";

export function HoldingsTableRow({
  holding,
  roleNameById,
  sectorNameById,
  onEdit,
  onDelete,
}: {
  holding: HoldingCalc;
  roleNameById: Map<string, string>;
  sectorNameById: Map<string, string>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isOverseas = holding.nativeCurrency === "USD";

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
      <TableCell>
        <FitText className={holding.roleId ? undefined : "text-muted-foreground italic"}>
          {holding.roleId ? (roleNameById.get(holding.roleId) ?? "-") : "미분류"}
        </FitText>
      </TableCell>
      <TableCell>
        <FitText className={holding.sectorId ? undefined : "text-muted-foreground italic"}>
          {holding.sectorId ? (sectorNameById.get(holding.sectorId) ?? "-") : "미지정"}
        </FitText>
      </TableCell>
      <TableCell>
        <FitText className="text-muted-foreground">{ASSET_TYPE_LABELS[holding.assetType]}</FitText>
      </TableCell>
      <TableCell>
        <FitText>{holding.account || "-"}</FitText>
        <FitText className="text-muted-foreground">{holding.region}</FitText>
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
