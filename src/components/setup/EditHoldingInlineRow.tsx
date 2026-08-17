import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { fmtQty, fmtUsd, fmtWon } from "@/lib/format";
import type { DraftHolding } from "@/lib/setupDraft";

/**
 * 읽기 전용 요약 한 줄 + 드래그 핸들. 종목 필드 편집은 보유종목 페이지로
 * 일원화됐다(ADR-0036) — 여기서는 같은 자산군 내 순서 변경과 다른 자산군으로의
 * 드래그 이동만 한다.
 */
export function EditHoldingInlineRow({
  holding,
  color,
  value,
  valueNative,
}: {
  holding: DraftHolding;
  color: string;
  /** Live KRW valuation (qty × current/avgPrice-fallback price) — resolved by
   * the parent via lib/calc/rebalance.ts resolveHoldingValueKrw, since draft
   * holdings aren't run through computeRebalance. */
  value: number;
  valueNative: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: holding.clientKey,
    data: { type: "holding", groupClientKey: holding.groupClientKey },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-wrap items-center gap-2.5 border-t border-border py-2">
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
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {holding.region} · {holding.account || "-"} · {fmtQty(holding.qty)} ·{" "}
        {holding.region === "해외" ? fmtUsd(holding.avgPrice) : fmtWon(holding.avgPrice)} · {fmtWon(value)}
        {holding.region === "해외" && <span> ({fmtUsd(valueNative)})</span>}
      </span>
    </div>
  );
}
