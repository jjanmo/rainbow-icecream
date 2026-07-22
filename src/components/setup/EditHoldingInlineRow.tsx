import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtPct } from "@/lib/format";
import { useEditableField, useEditableNumberField } from "@/hooks/useEditableField";
import type { DraftHolding } from "@/lib/setupDraft";

export function EditHoldingInlineRow({
  holding,
  color,
  targetPctOfWhole,
  onUpdate,
  onDelete,
}: {
  holding: DraftHolding;
  color: string;
  targetPctOfWhole: number;
  onUpdate: (patch: Partial<Pick<DraftHolding, "ticker" | "name" | "targetPctInGroup">>) => void;
  onDelete: () => void;
}) {
  const ticker = useEditableField(holding.ticker ?? "", (v) => onUpdate({ ticker: v }));
  const name = useEditableField(holding.name, (v) => onUpdate({ name: v }));
  const share = useEditableNumberField(holding.targetPctInGroup, (v) => onUpdate({ targetPctInGroup: v }));

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-border py-2">
      <div className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <Input
        value={ticker.value}
        onChange={(e) => ticker.onChange(e.target.value)}
        onBlur={ticker.onBlur}
        placeholder="티커"
        className="h-8 w-20 shrink-0 font-mono text-xs"
      />
      <Input
        value={name.value}
        onChange={(e) => name.onChange(e.target.value)}
        onBlur={name.onBlur}
        placeholder="종목명"
        className="h-8 min-w-25 flex-1 text-xs"
      />
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-[11.5px] text-muted-foreground">그룹 내</span>
        <Input
          type="text"
          inputMode="decimal"
          value={share.value}
          onChange={(e) => share.onChange(e.target.value)}
          onBlur={share.onBlur}
          className="h-8 w-14 text-right font-mono text-xs"
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground">= 전체의 {fmtPct(targetPctOfWhole)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onDelete}
        className="shrink-0 text-muted-foreground"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
