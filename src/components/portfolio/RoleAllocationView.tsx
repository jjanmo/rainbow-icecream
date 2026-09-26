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
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical } from 'lucide-react';
import { AllocationDonutChart } from '@/components/shared/AllocationDonutChart';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { computeAxisRebalance, type AxisBucketCalc, type AxisRebalanceResult } from '@/lib/calc/axisRebalance';
import { diffColor } from '@/lib/calc/rebalance';
import { fmtPct, fmtSigned, fmtUsd, fmtWon } from '@/lib/format';
import { type AxisCategory } from '@/types/domain';

/** 섹터가 없는 종목이 역할 버킷 안에서 모이는 자리 — 실제 섹터 row가 아니라 화면 전용 센티널. */
const UNASSIGNED_SECTOR_KEY = '__role_bucket_unassigned_sector__';

/**
 * `/portfolio`의 역할 탭 — 역할(1차축, 사용자가 계속 추가·삭제할 수 있는 동적 목록,
 * ADR-0063) 버킷들을 총자산 기준 목표/실제 도넛 + 행으로 보여주고, 각 버킷을 펼치면
 * **그 안이 다시 섹터별로 중첩**돼서 보인다(어느 역할이든 동일 — 섹터는 역할에 종속적인
 * 2차 축이라 어떤 역할 버킷에 어떤 섹터가 들어있는지 미리 알 수 없기 때문). 종목을
 * 버킷에 배정하는 드래그는 없다 — 분류는 매매 모달/`/holdings`에서 입력한다. **역할
 * 버킷의 순서 변경은 옛 자산군 드래그와 같은 원칙으로, 목표% 편집 모드(`isEditing`)
 * 중에만 가능하고 draft에 포함된다** — 드래그 핸들 자체가 편집 모드가 아니면 안 보인다
 * (dnd-kit `useSortable`은 항상 붙어있지만 `attributes`/`listeners`를 편집 모드에서만
 * 엘리먼트에 넘겨서 드래그를 시작할 방법을 없앤다). 완료를 눌러야 저장되고 취소하면
 * 버려진다 — `/portfolio`의 다른 편집 내용(목표%)과 동일한 draft/완료 규칙을 따른다.
 * 역할·섹터 목록 자체의 CRUD(이름·설명·삭제)는 `AxisCategoryManagerDialog`가 따로 맡는다.
 */
export function RoleAllocationView({
  result,
  sectors,
  isEditing,
  draftRoleTargets,
  onDraftRoleTargetChange,
  draftSectorTargets,
  onDraftSectorTargetChange,
  onReorderRoles,
}: {
  result: AxisRebalanceResult;
  sectors: AxisCategory[];
  isEditing: boolean;
  /** 편집 모드에서 역할별 목표% (draft, key = role의 AxisCategory id) — 반드시 합 100%. */
  draftRoleTargets: Record<string, number>;
  onDraftRoleTargetChange: (roleId: string, pct: number) => void;
  /** 편집 모드에서 섹터별 목표% (draft, key = sector의 AxisCategory id) — "그 섹터가
   * 속한 역할 버킷 내에서"의 목표, 합계 강제 없음. */
  draftSectorTargets: Record<string, number>;
  onDraftSectorTargetChange: (sectorId: string, pct: number) => void;
  /** 역할 버킷을 드래그로 재배치했을 때 — draft에만 반영, 완료 시 저장된다. 편집
   * 모드가 아니면 드래그 자체가 시작될 수 없으므로 이 콜백은 호출되지 않는다. */
  onReorderRoles: (orderedIds: string[]) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = result.buckets.map((b) => b.key);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderRoles(arrayMove(ids, oldIndex, newIndex));
  }

  const targetOf = (b: AxisBucketCalc) => (isEditing ? (draftRoleTargets[b.key] ?? 0) : b.targetPct);
  const shownSum = result.buckets.reduce((sum, b) => sum + targetOf(b), 0);
  const sumOk = Math.abs(shownSum - 100) < 0.5;

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-4">
        <AllocationDonutChart
          title={
            <>
              <span>목표 배분</span>
              {sumOk ? (
                <Badge className="bg-accent text-accent-foreground">정상</Badge>
              ) : (
                <Badge variant="destructive">
                  {shownSum > 100
                    ? `100%보다 ${fmtPct(shownSum - 100)} 초과 (${fmtPct(shownSum)})`
                    : `100%까지 ${fmtPct(100 - shownSum)} 남음 (${fmtPct(shownSum)})`}
                </Badge>
              )}
            </>
          }
          centerLabel="목표"
          data={result.buckets.map((b) => ({
            id: b.key,
            name: b.label,
            value: targetOf(b),
            color: b.color,
            valueLabel: fmtPct(targetOf(b)),
          }))}
          activeId={hoveredId}
          onActiveIdChange={setHoveredId}
        />
        <AllocationDonutChart
          title={
            <>
              <span>실제 보유 비중</span>
              {result.includedValue > 0 ? (
                <Badge className="bg-accent text-accent-foreground">총 {fmtWon(result.includedValue)}</Badge>
              ) : (
                <Badge variant="destructive">보유 데이터 없음</Badge>
              )}
            </>
          }
          centerLabel="실제"
          data={result.buckets.map((b) => ({
            id: b.key,
            name: b.label,
            value: b.actualPct,
            color: b.color,
            valueLabel: fmtPct(b.actualPct),
          }))}
          activeId={hoveredId}
          onActiveIdChange={setHoveredId}
        />
      </div>

      {result.excludedMembers.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          역할 미분류 {result.excludedMembers.length}종목은 위 비중에서 빠져 있습니다 — 매매 모달이나 보유 종목
          화면에서 역할을 지정해주세요.
        </p>
      )}

      {result.buckets.length === 0 && (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          아직 역할이 없습니다 — &ldquo;역할 관리&rdquo;에서 추가해주세요.
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={result.buckets.map((b) => b.key)} strategy={verticalListSortingStrategy}>
          {result.buckets.map((bucket) => (
            <RoleBucketCard
              key={bucket.key}
              bucket={bucket}
              sectors={sectors}
              isEditing={isEditing}
              draftTarget={draftRoleTargets[bucket.key] ?? 0}
              onDraftTargetChange={(pct) => onDraftRoleTargetChange(bucket.key, pct)}
              draftSectorTargets={draftSectorTargets}
              onDraftSectorTargetChange={onDraftSectorTargetChange}
            />
          ))}
        </SortableContext>
      </DndContext>
    </>
  );
}

function RoleBucketCard({
  bucket,
  sectors,
  isEditing,
  draftTarget,
  onDraftTargetChange,
  draftSectorTargets,
  onDraftSectorTargetChange,
}: {
  bucket: AxisBucketCalc;
  sectors: AxisCategory[];
  isEditing: boolean;
  draftTarget: number;
  onDraftTargetChange: (pct: number) => void;
  draftSectorTargets: Record<string, number>;
  onDraftSectorTargetChange: (sectorId: string, pct: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bucket.key });
  const dragStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const [expanded, setExpanded] = useState(false);
  const [targetDraft, setTargetDraft] = useState(String(draftTarget));
  const [prevDraft, setPrevDraft] = useState(draftTarget);
  if (draftTarget !== prevDraft) {
    setPrevDraft(draftTarget);
    setTargetDraft(String(draftTarget));
  }

  // 이 역할 버킷 안에서만 다시 섹터별로 집계 — computeAxisRebalance를 중첩으로 한 번 더
  // 호출하는 것뿐, 엔진 자체는 손대지 않는다. 분모가 bucket.members 합이라 actualPct는
  // 자동으로 "이 역할 안에서의 비중"이 된다.
  const nested = computeAxisRebalance({
    holdings: bucket.members,
    buckets: [
      ...sectors.map((s) => ({ key: s.id, label: s.name, description: s.description })),
      { key: UNASSIGNED_SECTOR_KEY, label: '섹터 미지정' },
    ],
    bucketOf: (h) => h.sectorId ?? UNASSIGNED_SECTOR_KEY,
    targets: Object.fromEntries(sectors.map((s) => [s.id, isEditing ? (draftSectorTargets[s.id] ?? 0) : s.targetPct])),
  });
  // 이 역할과 무관한(멤버도 없고 목표도 안 정한) 섹터는 목록에서 뺀다 — 안 그러면 유저가
  // 만든 모든 섹터가 역할마다 전부 나열돼 목록이 쓸데없이 길어진다.
  const visibleSectorBuckets = nested.buckets.filter(
    (b) => b.members.length > 0 || (b.key !== UNASSIGNED_SECTOR_KEY && b.targetPct > 0),
  );
  const unassignedSector = nested.buckets.find((b) => b.key === UNASSIGNED_SECTOR_KEY);
  const showUnassignedSector = !!unassignedSector && unassignedSector.members.length > 0;

  return (
    <div ref={setNodeRef} style={dragStyle} className="mb-4 rounded-lg border border-border bg-card p-5 sm:p-6">
      <div className={`flex flex-wrap items-center gap-3 ${expanded ? 'pb-2' : ''}`}>
        {isEditing && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            aria-label="순서 변경"
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <div className="size-3.5 shrink-0 rounded-full" style={{ background: bucket.color }} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">{bucket.label}</div>
          {bucket.description && (
            <div className="truncate text-[11px] text-muted-foreground">{bucket.description}</div>
          )}
        </div>

        <div className="flex shrink-0 items-end gap-3">
          <span className="flex w-16 flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground">목표</span>
            {isEditing ? (
              <Input
                type="text"
                inputMode="decimal"
                value={targetDraft}
                onChange={(e) => setTargetDraft(e.target.value)}
                onBlur={() => {
                  const parsed = parseFloat(targetDraft) || 0;
                  onDraftTargetChange(parsed);
                  setTargetDraft(String(parsed));
                }}
                className="h-7 w-14 text-right font-mono text-xs"
              />
            ) : (
              <span className="font-mono text-sm">{fmtPct(bucket.targetPct)}</span>
            )}
          </span>
          <span className="flex w-16 flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground">실제</span>
            <span className="font-mono text-sm">{fmtPct(bucket.actualPct)}</span>
          </span>
          <span className="flex w-16 flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground">차이</span>
            <span className="font-mono text-sm font-semibold" style={{ color: diffColor(bucket.diff) }}>
              {fmtSigned(bucket.diff)}p
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 cursor-pointer text-muted-foreground"
          aria-label={expanded ? '접기' : '펼치기'}
        >
          <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 pt-2">
          {visibleSectorBuckets.length === 0 && !showUnassignedSector && (
            <p className="border-t border-border py-3 text-center text-xs text-muted-foreground">
              이 역할에 속한 종목이 없습니다.
            </p>
          )}
          {visibleSectorBuckets.map((sb) => (
            <SectorRow
              key={sb.key}
              sector={sb}
              isEditing={isEditing}
              draftTarget={draftSectorTargets[sb.key] ?? 0}
              onDraftTargetChange={(pct) => onDraftSectorTargetChange(sb.key, pct)}
            />
          ))}
          {showUnassignedSector && (
            <SectorRow sector={unassignedSector} isEditing={false} draftTarget={0} onDraftTargetChange={() => {}} />
          )}
        </div>
      )}
    </div>
  );
}

function SectorRow({
  sector,
  isEditing,
  draftTarget,
  onDraftTargetChange,
}: {
  sector: AxisBucketCalc;
  isEditing: boolean;
  draftTarget: number;
  onDraftTargetChange: (pct: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [targetDraft, setTargetDraft] = useState(String(draftTarget));
  const [prevDraft, setPrevDraft] = useState(draftTarget);
  if (draftTarget !== prevDraft) {
    setPrevDraft(draftTarget);
    setTargetDraft(String(draftTarget));
  }
  const isUnassigned = sector.key === UNASSIGNED_SECTOR_KEY;

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 pl-3 pr-2 py-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <div className={`truncate text-sm ${isUnassigned ? 'text-muted-foreground italic' : ''}`}>
            {sector.label}
          </div>
          {sector.description && (
            <div className="truncate text-[10px] text-muted-foreground">{sector.description}</div>
          )}
        </div>
        <div className="flex shrink-0 items-end gap-2.5">
          {!isUnassigned && (
            <span className="flex w-14 flex-col items-end leading-tight">
              <span className="text-[9px] text-muted-foreground">역할 내 목표</span>
              {isEditing ? (
                <Input
                  type="text"
                  inputMode="decimal"
                  value={targetDraft}
                  onChange={(e) => setTargetDraft(e.target.value)}
                  onBlur={() => {
                    const parsed = parseFloat(targetDraft) || 0;
                    onDraftTargetChange(parsed);
                    setTargetDraft(String(parsed));
                  }}
                  className="h-6 w-12 text-right font-mono text-[11px]"
                />
              ) : (
                <span className="font-mono text-xs">{fmtPct(sector.targetPct)}</span>
              )}
            </span>
          )}
          <span className="flex w-14 flex-col items-end leading-tight">
            <span className="text-[9px] text-muted-foreground">역할 내 비중</span>
            <span className="font-mono text-xs">{fmtPct(sector.actualPct)}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 cursor-pointer text-muted-foreground"
          aria-label={expanded ? '접기' : '펼치기'}
        >
          <ChevronDown className={`size-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-1.5 space-y-1 border-t border-border/60 pt-1.5">
          {sector.members.map((h) => {
            const isOverseas = h.nativeCurrency === 'USD';
            const pctInSector = sector.value > 0 ? (h.value / sector.value) * 100 : 0;
            return (
              <div key={h.id} className="flex items-center gap-2 text-[11px]">
                <span className="w-12 shrink-0 truncate font-mono text-muted-foreground">{h.ticker ?? ''}</span>
                <span className="min-w-0 flex-1 truncate">{h.name}</span>
                <span className="w-36 shrink-0 text-right font-mono">
                  {fmtWon(h.value)}
                  {isOverseas && <span className="ml-1 text-muted-foreground">({fmtUsd(h.valueNative)})</span>}
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-muted-foreground">{fmtPct(pctInSector)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
