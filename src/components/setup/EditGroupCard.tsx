import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEditableField, useEditableNumberField } from '@/hooks/useEditableField';
import { tintForIndex } from '@/lib/calc/color';
import { resolveHoldingValueKrw } from '@/lib/calc/rebalance';
import { draftColorSlots, type DraftGroup, type DraftHolding } from '@/lib/setupDraft';
import type { LivePriceMap } from '@/types/domain';
import { EditHoldingInlineRow } from './EditHoldingInlineRow';

/** 접힌 자산군에도 종목을 드래그해 옮길 수 있어야 하므로, 헤더 자체가 항상
 * 드롭 대상이다 — 펼쳤을 때는 목록 안 종목들이 더 정밀한 드롭 대상이 된다. */
export function groupDropId(clientKey: string): string {
  return `group-drop-${clientKey}`;
}

export function EditGroupCard({
  group,
  color,
  hue,
  holdings,
  prices,
  usdKrwRate,
  onUpdate,
  onDelete,
}: {
  group: DraftGroup;
  /** This group's derived color/hue — computed by the parent from its position
   * among all groups (lib/calc/color.ts hueForGroupIndex), not user-settable. */
  color: string;
  hue: number;
  /** This group's holdings, already sorted by sortOrder. */
  holdings: DraftHolding[];
  /** For resolving each draft holding's live 평가금 — see resolveHoldingValueKrw. */
  prices: LivePriceMap;
  usdKrwRate: number;
  onUpdate: (patch: Partial<Pick<DraftGroup, 'name' | 'targetPct'>>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Creation-order color slots, so a holding's tint survives drag-reordering
  // here just like it does in read mode (ADR-0025).
  const colorSlots = draftColorSlots(holdings);
  const name = useEditableField(group.name, (v) => onUpdate({ name: v }));
  const targetPct = useEditableNumberField(group.targetPct, (v) => onUpdate({ targetPct: v }));

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.clientKey,
    data: { type: 'group' },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // 종목 dnd 전용 드롭 대상 — 자산군 간 이동 시 헤더 위로 놓으면(특히 접힌
  // 상태에서) 이 자산군 맨 뒤로 옮겨진다 (pages/setup.tsx의 handleHoldingDragOver).
  const { setNodeRef: setHeaderDroppableRef, isOver } = useDroppable({
    id: groupDropId(group.clientKey),
    data: { type: 'group-header', groupClientKey: group.clientKey },
  });

  return (
    <div ref={setNodeRef} style={style} className="mb-4 rounded-lg border border-border bg-card p-5 sm:p-6">
      <div
        ref={setHeaderDroppableRef}
        className={`flex flex-wrap items-center gap-2.5 rounded-md transition-colors ${expanded ? 'mb-2.5' : ''} ${isOver ? 'bg-accent/50' : ''}`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <div className="size-3.5 shrink-0 rounded-full" style={{ background: color }} />
        <Input
          value={name.value}
          onChange={(e) => name.onChange(e.target.value)}
          onBlur={name.onBlur}
          className="h-8 min-w-25 flex-1 border-none bg-transparent px-0 text-[15px] font-semibold shadow-none focus-visible:ring-0"
        />
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[11px] text-muted-foreground">전체의</span>
          <Input
            type="text"
            inputMode="decimal"
            value={targetPct.value}
            onChange={(e) => targetPct.onChange(e.target.value)}
            onBlur={targetPct.onBlur}
            className="h-8 w-14 text-right font-mono text-xs"
          />
          <span className="text-[11px] text-muted-foreground">%</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          title="자산군 삭제 시 하위 종목은 미분류로 이동합니다"
          className="shrink-0 text-muted-foreground"
        >
          삭제
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 text-muted-foreground"
        >
          <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </Button>
      </div>

      {expanded && (
        <SortableContext items={holdings.map((h) => h.clientKey)} strategy={verticalListSortingStrategy}>
          {holdings.map((holding) => {
            const resolved = resolveHoldingValueKrw(holding, prices, usdKrwRate);
            return (
              <EditHoldingInlineRow
                key={holding.clientKey}
                holding={holding}
                color={tintForIndex(hue, colorSlots.get(holding.clientKey) ?? 0, holdings.length)}
                value={resolved.value}
                valueNative={resolved.valueNative}
              />
            );
          })}
          {holdings.length === 0 && (
            <p className="border-t border-border py-3 text-center text-xs text-muted-foreground">
              종목이 없습니다 — 다른 자산군에서 드래그해 옮기거나, 보유 종목 화면에서 이 자산군으로 등록하세요.
            </p>
          )}
        </SortableContext>
      )}
    </div>
  );
}
