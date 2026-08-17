import { useState } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEditableField, useEditableNumberField } from '@/hooks/useEditableField';
import { tintForIndex } from '@/lib/calc/color';
import { resolveHoldingValueKrw } from '@/lib/calc/rebalance';
import type { DraftGroup, DraftHolding } from '@/lib/setupDraft';
import type { LivePriceMap } from '@/types/domain';
import { EditHoldingInlineRow } from './EditHoldingInlineRow';

export function EditGroupCard({
  group,
  color,
  hue,
  holdings,
  groupOptions,
  prices,
  usdKrwRate,
  onUpdate,
  onDelete,
  onAddHolding,
  onUpdateHolding,
  onReorderHoldings,
  onDeleteHolding,
}: {
  group: DraftGroup;
  /** This group's derived color/hue — computed by the parent from its position
   * among all groups (lib/calc/color.ts hueForGroupIndex), not user-settable. */
  color: string;
  hue: number;
  /** This group's holdings, already sorted by sortOrder. */
  holdings: DraftHolding[];
  groupOptions: { id: string; name: string }[];
  /** For resolving each draft holding's live 평가금 — see resolveHoldingValueKrw. */
  prices: LivePriceMap;
  usdKrwRate: number;
  onUpdate: (patch: Partial<Pick<DraftGroup, 'name' | 'targetPct'>>) => void;
  onDelete: () => void;
  onAddHolding: () => void;
  onUpdateHolding: (clientKey: string, patch: Partial<DraftHolding>) => void;
  onReorderHoldings: (groupClientKey: string, orderedClientKeys: string[]) => void;
  onDeleteHolding: (clientKey: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const name = useEditableField(group.name, (v) => onUpdate({ name: v }));
  const targetPct = useEditableNumberField(group.targetPct, (v) => onUpdate({ targetPct: v }));

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.clientKey,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const clientKeys = holdings.map((h) => h.clientKey);
    const oldIndex = clientKeys.indexOf(String(active.id));
    const newIndex = clientKeys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderHoldings(group.clientKey, arrayMove(clientKeys, oldIndex, newIndex));
  }

  return (
    <div ref={setNodeRef} style={style} className="mb-4 rounded-lg border border-border bg-card p-5 sm:p-6">
      <div className={`flex flex-wrap items-center gap-2.5 ${expanded ? 'mb-2.5' : ''}`}>
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
          title="자산군 삭제 시 하위 종목도 함께 삭제됩니다"
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
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={holdings.map((h) => h.clientKey)} strategy={verticalListSortingStrategy}>
              {holdings.map((holding, index) => {
                const resolved = resolveHoldingValueKrw(holding, prices, usdKrwRate);
                return (
                  <EditHoldingInlineRow
                    key={holding.clientKey}
                    holding={holding}
                    color={tintForIndex(hue, index, holdings.length)}
                    value={resolved.value}
                    valueNative={resolved.valueNative}
                    groupOptions={groupOptions}
                    onUpdate={(patch) => onUpdateHolding(holding.clientKey, patch)}
                    onDelete={() => onDeleteHolding(holding.clientKey)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>

          <button
            type="button"
            onClick={onAddHolding}
            className="mt-2.5 w-full rounded-lg border-[1.5px] border-dashed border-border py-2.5 text-[13px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            + 종목 추가
          </button>
        </>
      )}
    </div>
  );
}
