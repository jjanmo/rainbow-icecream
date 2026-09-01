import { useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { AxisAllocationView } from "@/components/portfolio/AxisAllocationView";
import { AxisTabs, useAxisFromQuery } from "@/components/portfolio/AxisTabs";
import { EditGroupCard } from "@/components/portfolio/EditGroupCard";
import { GroupCard } from "@/components/portfolio/GroupCard";
import { UngroupedHoldingsCard } from "@/components/portfolio/UngroupedHoldingsCard";
import { AllocationDonutChart } from "@/components/shared/AllocationDonutChart";
import { DataErrorNotice } from "@/components/shared/DataErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAxisTargets, useSaveAxisTargets, targetsByBucket } from "@/hooks/useAxisTargets";
import { useAddGroup, useDeleteGroup, useUpdateGroup } from "@/hooks/useGroups";
import { useAddHolding, useDeleteHolding, useUpdateHolding } from "@/hooks/useHoldings";
import { useRebalanceData } from "@/hooks/useRebalanceData";
import { computeAxisRebalance, MARKET_BUCKETS, marketBucketOf } from "@/lib/calc/axisRebalance";
import { groupColor } from "@/lib/calc/color";
import { UNGROUPED_KEY } from "@/lib/calc/rebalance";
import { fmtPct, fmtWon } from "@/lib/format";
import {
  commitPortfolioDraft,
  moveDraftHoldingToGroup,
  newDraftGroup,
  reorderDraftGroups,
  reorderDraftHoldings,
  toDraftGroup,
  toDraftHolding,
  type DraftGroup,
  type DraftHolding,
} from "@/lib/portfolioDraft";

export default function SetupPage() {
  const axis = useAxisFromQuery();
  const { data, prices, usdKrwRate, isLoading, isError, error } = useRebalanceData();
  const axisTargetsQuery = useAxisTargets();
  const saveAxisTargets = useSaveAxisTargets();
  const addGroup = useAddGroup();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();
  const addHolding = useAddHolding();
  const updateHolding = useUpdateHolding();
  const deleteHolding = useDeleteHolding();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftGroups, setDraftGroups] = useState<DraftGroup[]>([]);
  const [draftHoldings, setDraftHoldings] = useState<DraftHolding[]>([]);
  const [draftMarketTargets, setDraftMarketTargets] = useState<Record<string, number>>({});
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);

  const savedMarketTargets = useMemo(
    () => targetsByBucket(axisTargetsQuery.data, "market"),
    [axisTargetsQuery.data],
  );

  const marketResult = useMemo(() => {
    if (!data) return undefined;
    return computeAxisRebalance({
      holdings: data.holdings,
      buckets: MARKET_BUCKETS,
      bucketOf: marketBucketOf,
      targets: isEditing ? draftMarketTargets : savedMarketTargets,
    });
  }, [data, isEditing, draftMarketTargets, savedMarketTargets]);

  const targetSumOk = data ? Math.abs(data.targetSum - 100) < 0.5 : true;
  const draftTargetSum = draftGroups.reduce((sum, g) => sum + g.targetPct, 0);
  const draftTargetSumInvalid = Math.abs(draftTargetSum - 100) >= 0.5;

  // 시장·변동성 축 목표는 "설정했을 때만" 100% 강제 — 전부 0이면 그 축을 안 쓰는 것으로 보고 완료를 막지 않는다.
  const draftMarketSum = Object.values(draftMarketTargets).reduce((sum, n) => sum + n, 0);
  const draftMarketSumInvalid = draftMarketSum > 0 && Math.abs(draftMarketSum - 100) >= 0.5;

  function startEditing() {
    if (!data) return;
    setDraftGroups(data.groups.map(toDraftGroup));
    setDraftHoldings(data.holdings.map(toDraftHolding));
    setDraftMarketTargets(
      Object.fromEntries(MARKET_BUCKETS.map((b) => [b.key, savedMarketTargets[b.key] ?? 0])),
    );
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setDraftGroups([]);
    setDraftHoldings([]);
    setDraftMarketTargets({});
  }

  async function finishEditing() {
    if (!data) return;
    setIsSaving(true);
    try {
      await commitPortfolioDraft({
        originalGroups: data.groups,
        originalHoldings: data.holdings,
        draftGroups,
        draftHoldings,
        mutations: {
          addGroup: (group) => addGroup.mutateAsync(group),
          updateGroup: (input) => updateGroup.mutateAsync(input),
          deleteGroup: (id) => deleteGroup.mutateAsync(id),
          addHolding: (holding) => addHolding.mutateAsync(holding),
          updateHolding: (input) => updateHolding.mutateAsync(input),
          deleteHolding: (id) => deleteHolding.mutateAsync(id),
        },
      });

      // 시장·변동성 축 목표 — draft가 저장값과 다르면 통째로 교체한다 (ADR-0058).
      const marketChanged = MARKET_BUCKETS.some(
        (b) => (draftMarketTargets[b.key] ?? 0) !== (savedMarketTargets[b.key] ?? 0),
      );
      if (marketChanged) {
        await saveAxisTargets.mutateAsync({ axis: "market", targets: draftMarketTargets });
      }

      setIsEditing(false);
      setDraftGroups([]);
      setDraftHoldings([]);
      setDraftMarketTargets({});
    } catch (err) {
      console.error("Failed to save portfolio setup", err);
      toast.error("저장 중 일부가 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateDraftGroup(clientKey: string, patch: Partial<Pick<DraftGroup, "name" | "targetPct">>) {
    setDraftGroups((groups) => groups.map((g) => (g.clientKey === clientKey ? { ...g, ...patch } : g)));
  }

  function deleteDraftGroup(clientKey: string) {
    setDraftGroups((groups) => groups.filter((g) => g.clientKey !== clientKey));
    // 종목은 지우지 않고 "미지정"으로 보낸다 (ADR-0035/0059) — 바로 아래 미지정
    // 목록에 나타나서 다른 자산군으로 드래그해 재배정할 수 있다.
    setDraftHoldings((holdings) =>
      holdings.map((h) => (h.groupClientKey === clientKey ? { ...h, groupClientKey: UNGROUPED_KEY } : h)),
    );
  }

  function addDraftGroup() {
    setDraftGroups((groups) => [...groups, newDraftGroup(groups.length)]);
  }

  function reorderGroups(orderedClientKeys: string[]) {
    setDraftGroups((groups) => reorderDraftGroups(groups, orderedClientKeys));
  }

  function reorderHoldings(groupClientKey: string, orderedClientKeys: string[]) {
    setDraftHoldings((holdings) => reorderDraftHoldings(holdings, orderedClientKeys));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function dragType(event: { active: { data: { current?: Record<string, unknown> } } }): string | undefined {
    return event.active.data.current?.type as string | undefined;
  }

  function targetGroupOf(over: NonNullable<DragOverEvent["over"]>): string | undefined {
    const overData = over.data.current as { groupClientKey?: string } | undefined;
    if (overData?.groupClientKey) return overData.groupClientKey;
    return draftHoldings.find((h) => h.clientKey === over.id)?.groupClientKey;
  }

  // 종목을 다른 자산군 위로 드래그하는 순간 그 자산군 맨 뒤로 낙관적 이동시켜
  // 드래그 중 미리보기가 실제로 옮겨진 것처럼 보이게 한다 (ADR-0036).
  // handleHoldingDragEnd가 최종 위치를 정밀하게 잡는다.
  function handleHoldingDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || dragType(event) !== "holding") return;
    const activeId = String(active.id);
    const targetGroup = targetGroupOf(over);
    const currentGroup = draftHoldings.find((h) => h.clientKey === activeId)?.groupClientKey;
    if (!targetGroup || !currentGroup || targetGroup === currentGroup) return;
    setDraftHoldings((holdings) => moveDraftHoldingToGroup(holdings, activeId, targetGroup));
  }

  function handleGroupDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const clientKeys = sortedDraftGroups.map((g) => g.clientKey);
    const oldIndex = clientKeys.indexOf(String(active.id));
    const newIndex = clientKeys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorderGroups(arrayMove(clientKeys, oldIndex, newIndex));
  }

  // handleHoldingDragOver가 이미 최종 자산군으로 옮겨뒀으므로, 여기서는 그
  // 자산군 안에서의 정확한 순서만 확정한다.
  function handleHoldingDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const group = draftHoldings.find((h) => h.clientKey === activeId)?.groupClientKey;
    if (!group) return;
    const siblingKeys = draftHoldings
      .filter((h) => h.groupClientKey === group)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((h) => h.clientKey);
    const oldIndex = siblingKeys.indexOf(activeId);
    const newIndex = siblingKeys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
    reorderHoldings(group, arrayMove(siblingKeys, oldIndex, newIndex));
  }

  function handleDragEnd(event: DragEndEvent) {
    if (dragType(event) === "holding") handleHoldingDragEnd(event);
    else handleGroupDragEnd(event);
  }

  const sortedDraftGroups = [...draftGroups].sort((a, b) => a.sortOrder - b.sortOrder);
  const ungroupedDraftHoldings = draftHoldings
    .filter((h) => h.groupClientKey === UNGROUPED_KEY)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // 읽기 모드용 — 자산군 미지정(group_id null) 종목 요약. computeRebalance는 이들을
  // 어떤 그룹에도 안 넣으므로 그룹 비중 합이 100% 미만이 될 수 있다 (ADR-0059).
  const ungroupedHoldings = (data?.holdings ?? []).filter((h) => h.groupId === null);
  const ungroupedCount = ungroupedHoldings.length;
  const ungroupedValue = ungroupedHoldings.reduce((sum, h) => sum + h.value, 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-xl font-semibold sm:text-2xl">포트폴리오</h1>
          <p className="text-sm text-muted-foreground">
            자산군의 전체 목표 비중과, 그 안에서 각 종목이 차지할 비중을 정하세요.
          </p>
        </div>
        {data &&
          (isEditing ? (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={cancelEditing} disabled={isSaving}>
                  취소
                </Button>
                <Button
                  type="button"
                  onClick={finishEditing}
                  disabled={isSaving || draftTargetSumInvalid || draftMarketSumInvalid}
                  title={
                    draftTargetSumInvalid || draftMarketSumInvalid
                      ? "축별 목표 비중 합계가 100%가 아니면 완료할 수 없습니다"
                      : undefined
                  }
                >
                  {isSaving ? "저장 중..." : "완료"}
                </Button>
              </div>
              {draftTargetSumInvalid && (
                <span className="text-[11px] text-destructive">
                  자산군 목표 비중 합계가 {fmtPct(draftTargetSum)}로{" "}
                  {draftTargetSum > 100
                    ? `100%보다 ${fmtPct(draftTargetSum - 100)} 초과했습니다`
                    : `100%까지 ${fmtPct(100 - draftTargetSum)} 부족합니다`}
                </span>
              )}
              {draftMarketSumInvalid && (
                <span className="text-[11px] text-destructive">
                  시장 목표 비중 합계가 {fmtPct(draftMarketSum)}입니다 (0 또는 100이어야 함)
                </span>
              )}
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={startEditing}>
              수정
            </Button>
          ))}
      </div>

      <AxisTabs axis={axis} />

      {isError && <DataErrorNotice error={error} />}

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : axis === "market" ? (
        marketResult && (
          <AxisAllocationView
            result={marketResult}
            isEditing={isEditing}
            draftTargets={draftMarketTargets}
            onDraftTargetChange={(bucket, pct) =>
              setDraftMarketTargets((t) => ({ ...t, [bucket]: pct }))
            }
            note={
              <p className="mb-4 text-xs text-muted-foreground">
                상장 시장이 아니라 <span className="font-medium text-foreground">실질 익스포저</span> 기준입니다 —
                국내 상장 미국 ETF는 &ldquo;미국&rdquo;, 현금·채권·원자재는 &ldquo;기타&rdquo;로 잡힙니다. 종목별
                값은 보유 종목 화면에서 바꿉니다.
              </p>
            }
          />
        )
      ) : isEditing ? (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            종목을 드래그하면 같은 자산군 안에서 순서를 바꾸거나 다른 자산군으로 옮길 수 있습니다. 종목 자체를
            추가·수정·삭제하려면 보유 종목 화면을 이용하세요.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragOver={handleHoldingDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedDraftGroups.map((g) => g.clientKey)}
              strategy={verticalListSortingStrategy}
            >
              {sortedDraftGroups.map((group, index) => (
                <EditGroupCard
                  key={group.clientKey}
                  group={group}
                  color={groupColor(index, sortedDraftGroups.length)}
                  holdings={draftHoldings
                    .filter((h) => h.groupClientKey === group.clientKey)
                    .sort((a, b) => a.sortOrder - b.sortOrder)}
                  prices={prices}
                  usdKrwRate={usdKrwRate}
                  onUpdate={(patch) => updateDraftGroup(group.clientKey, patch)}
                  onDelete={() => deleteDraftGroup(group.clientKey)}
                />
              ))}
            </SortableContext>

            {ungroupedDraftHoldings.length > 0 && (
              <UngroupedHoldingsCard
                holdings={ungroupedDraftHoldings}
                ungroupedKey={UNGROUPED_KEY}
                prices={prices}
                usdKrwRate={usdKrwRate}
              />
            )}
          </DndContext>

          <Button
            type="button"
            variant="outline"
            className="border-[1.5px] border-primary text-primary hover:bg-accent hover:text-accent-foreground"
            onClick={addDraftGroup}
          >
            + 자산군 추가
          </Button>
        </>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-4">
            <AllocationDonutChart
              title={
                <>
                  <span>목표 배분 (자산군)</span>
                  {targetSumOk ? (
                    <Badge className="bg-accent text-accent-foreground">정상</Badge>
                  ) : (
                    <Badge variant="destructive">
                      {data.targetSum > 100
                        ? `100%보다 ${fmtPct(data.targetSum - 100)} 초과 (${fmtPct(data.targetSum)})`
                        : `100%까지 ${fmtPct(100 - data.targetSum)} 남음 (${fmtPct(data.targetSum)})`}
                    </Badge>
                  )}
                </>
              }
              centerLabel="목표"
              data={data.groups.map((g) => ({
                id: g.id,
                name: g.name,
                value: g.targetPct,
                color: g.color,
                valueLabel: fmtPct(g.targetPct),
              }))}
              activeId={hoveredGroupId}
              onActiveIdChange={setHoveredGroupId}
            />
            <AllocationDonutChart
              title={
                <>
                  <span>실제 보유 비중</span>
                  {data.totalValue > 0 ? (
                    <Badge className="bg-accent text-accent-foreground">총 {fmtWon(data.totalValue)}</Badge>
                  ) : (
                    <Badge variant="destructive">보유 데이터 없음</Badge>
                  )}
                </>
              }
              centerLabel="실제"
              data={data.groups.map((g) => ({
                id: g.id,
                name: g.name,
                value: g.actualPct,
                color: g.color,
                valueLabel: fmtPct(g.actualPct),
              }))}
              activeId={hoveredGroupId}
              onActiveIdChange={setHoveredGroupId}
            />
          </div>

          {data.groups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}

          {ungroupedValue > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              자산군 미지정 종목 {ungroupedCount}개 ({fmtWon(ungroupedValue)}) — 위 비중에는 포함되지 않습니다. 수정에서
              자산군에 배정하세요.
            </p>
          )}
        </>
      )}
    </div>
  );
}
