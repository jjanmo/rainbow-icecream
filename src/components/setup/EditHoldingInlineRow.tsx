import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEditableField, useEditableNumberField } from "@/hooks/useEditableField";
import { fmtQty, fmtUsd, fmtWon } from "@/lib/format";
import type { DraftHolding } from "@/lib/setupDraft";
import type { Region } from "@/types/domain";

const REGION_ITEMS = [
  { label: "국내", value: "국내" },
  { label: "해외", value: "해외" },
];

const ACCOUNT_TYPES = ["일반계좌", "ISA", "연금저축", "IRP", "CMA", "파킹통장", "예적금", "기타"];
const ACCOUNT_ITEMS = ACCOUNT_TYPES.map((v) => ({ label: v, value: v }));

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-muted-foreground">{children}</span>;
}

export function EditHoldingInlineRow({
  holding,
  color,
  value,
  valueNative,
  groupOptions,
  onUpdate,
  onDelete,
}: {
  holding: DraftHolding;
  color: string;
  /** Live KRW valuation (qty × current/avgPrice-fallback price) — resolved by
   * the parent via lib/calc/rebalance.ts resolveHoldingValueKrw, since draft
   * holdings aren't run through computeRebalance. */
  value: number;
  valueNative: number;
  groupOptions: { id: string; name: string }[];
  onUpdate: (patch: Partial<DraftHolding>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: holding.clientKey,
  });

  const ticker = useEditableField(holding.ticker ?? "", (v) => onUpdate({ ticker: v }));
  const name = useEditableField(holding.name, (v) => onUpdate({ name: v }));
  const qty = useEditableNumberField(holding.qty, (v) => onUpdate({ qty: v }));
  const avgPrice = useEditableNumberField(holding.avgPrice, (v) => onUpdate({ avgPrice: v }));
  const memo = useEditableField(holding.memo ?? "", (v) => onUpdate({ memo: v }));
  const avgPriceUnit = holding.region === "해외" ? "USD" : "KRW";
  const groupItems = groupOptions.map((g) => ({ label: g.name, value: g.id }));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="border-t border-border">
      <div className="flex flex-wrap items-center gap-2.5 py-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        <div className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
        {holding.ticker && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{holding.ticker}</span>
        )}
        <span className="flex-1 text-xs">{holding.name}</span>
        {!expanded && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {holding.region} · {holding.account || "-"} · {fmtQty(holding.qty)} ·{" "}
            {holding.region === "해외" ? fmtUsd(holding.avgPrice) : fmtWon(holding.avgPrice)} ·{" "}
            {fmtWon(value)}
            {holding.region === "해외" && <span> ({fmtUsd(valueNative)})</span>}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 text-muted-foreground"
        >
          <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </Button>
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

      {expanded && (
        <div className="flex flex-col gap-2.5 pb-3 pl-6">
          <div className="flex flex-col gap-1.5">
            <FieldLabel>자산군</FieldLabel>
            <Select
              items={groupItems}
              value={holding.groupClientKey}
              onValueChange={(v) => v && onUpdate({ groupClientKey: v })}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2.5">
            <div className="flex flex-1 flex-col gap-1.5">
              <FieldLabel>티커</FieldLabel>
              <Input
                value={ticker.value}
                onChange={(e) => ticker.onChange(e.target.value)}
                onBlur={ticker.onBlur}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="flex flex-2 flex-col gap-1.5">
              <FieldLabel>종목명</FieldLabel>
              <Input
                value={name.value}
                onChange={(e) => name.onChange(e.target.value)}
                onBlur={name.onBlur}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="flex gap-2.5">
            <div className="flex w-24 flex-col gap-1.5">
              <FieldLabel>구분</FieldLabel>
              <Select
                items={REGION_ITEMS}
                value={holding.region}
                onValueChange={(v) => v && onUpdate({ region: v as Region })}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="국내">국내</SelectItem>
                  <SelectItem value="해외">해외</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <FieldLabel>계좌</FieldLabel>
              <Select
                items={ACCOUNT_ITEMS}
                value={holding.account ?? ""}
                onValueChange={(v) => v && onUpdate({ account: v })}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue placeholder="계좌 선택" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2.5">
            <div className="flex flex-1 flex-col gap-1.5">
              <FieldLabel>보유수량</FieldLabel>
              <Input
                type="text"
                inputMode="decimal"
                value={qty.value}
                onChange={(e) => qty.onChange(e.target.value)}
                onBlur={qty.onBlur}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <FieldLabel>평균매입가 ({avgPriceUnit})</FieldLabel>
              <Input
                type="text"
                inputMode="decimal"
                value={avgPrice.value}
                onChange={(e) => avgPrice.onChange(e.target.value)}
                onBlur={avgPrice.onBlur}
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <FieldLabel>비고</FieldLabel>
            <Input
              value={memo.value}
              onChange={(e) => memo.onChange(e.target.value)}
              onBlur={memo.onBlur}
              className="h-8 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}
