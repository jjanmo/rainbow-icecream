import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { resolveHoldingValueKrw } from '@/lib/calc/rebalance';
import type { DraftHolding } from '@/lib/portfolioDraft';
import type { LivePriceMap } from '@/types/domain';
import { EditHoldingInlineRow } from './EditHoldingInlineRow';
import { groupDropId } from './EditGroupCard';

/**
 * `/portfolio` 편집 모드에서 **어느 자산군에도 속하지 않은 종목**(group_id null,
 * ADR-0059)을 모아 보여주는 섹션. 실제 자산군 카드(`EditGroupCard`)와 달리 이름·
 * 목표%·삭제·순서 이동이 없다 — 여기 있는 종목을 드래그해 실제 자산군에 배정하는
 * 용도다(반대로 자산군에서 여기로 끌어다 놓으면 배정이 해제된다). 읽기 모드에는
 * 아예 안 나온다.
 */
export function UngroupedHoldingsCard({
  holdings,
  ungroupedKey,
  prices,
  usdKrwRate,
}: {
  /** groupClientKey === ungroupedKey인 draft 종목들, sortOrder로 정렬된 상태. */
  holdings: DraftHolding[];
  ungroupedKey: string;
  prices: LivePriceMap;
  usdKrwRate: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: groupDropId(ungroupedKey),
    data: { type: 'group-header', groupClientKey: ungroupedKey },
  });

  return (
    <div className="mb-4 rounded-lg border border-dashed border-border bg-card p-5 sm:p-6">
      <div
        ref={setNodeRef}
        className={`flex items-center gap-2.5 rounded-md transition-colors ${isOver ? 'bg-accent/50' : ''}`}
      >
        <div className="size-3.5 shrink-0 rounded-full bg-muted-foreground/40" />
        <span className="flex-1 text-[15px] font-semibold text-muted-foreground">자산군 미지정</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{holdings.length}개 · 드래그해서 자산군에 배정</span>
      </div>

      <div className="mt-2.5">
        <SortableContext items={holdings.map((h) => h.clientKey)} strategy={verticalListSortingStrategy}>
          {holdings.map((holding) => {
            const resolved = resolveHoldingValueKrw(holding, prices, usdKrwRate);
            return (
              <EditHoldingInlineRow
                key={holding.clientKey}
                holding={holding}
                value={resolved.value}
                valueNative={resolved.valueNative}
              />
            );
          })}
        </SortableContext>
      </div>
    </div>
  );
}
