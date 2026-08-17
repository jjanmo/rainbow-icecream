import { useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { EditGroupCard } from "@/components/setup/EditGroupCard";
import { GroupCard } from "@/components/setup/GroupCard";
import { HoldingFormDialog } from "@/components/holdings/HoldingFormDialog";
import { AllocationDonutChart } from "@/components/shared/AllocationDonutChart";
import { DataErrorNotice } from "@/components/shared/DataErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAddGroup, useDeleteGroup, useUpdateGroup } from "@/hooks/useGroups";
import { useAddHolding, useDeleteHolding, useUpdateHolding } from "@/hooks/useHoldings";
import { useRebalanceData } from "@/hooks/useRebalanceData";
import { hueForGroupIndex, groupColor } from "@/lib/calc/color";
import { fmtPct, fmtWon } from "@/lib/format";
import {
  commitSetupDraft,
  draftHoldingFromForm,
  newDraftGroup,
  reorderDraftGroups,
  reorderDraftHoldings,
  toDraftGroup,
  toDraftHolding,
  type DraftGroup,
  type DraftHolding,
} from "@/lib/setupDraft";
import type { NewHolding } from "@/types/domain";

export default function SetupPage() {
  const { data, prices, usdKrwRate, isLoading, isError, error } = useRebalanceData();
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
  const [addingToGroupKey, setAddingToGroupKey] = useState<string | null>(null);

  const targetSumOk = data ? Math.abs(data.targetSum - 100) < 0.5 : true;
  const draftTargetSum = draftGroups.reduce((sum, g) => sum + g.targetPct, 0);
  const draftTargetSumOverLimit = draftTargetSum > 100;

  function startEditing() {
    if (!data) return;
    setDraftGroups(data.groups.map(toDraftGroup));
    setDraftHoldings(data.holdings.map(toDraftHolding));
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setDraftGroups([]);
    setDraftHoldings([]);
  }

  async function finishEditing() {
    if (!data) return;
    setIsSaving(true);
    try {
      await commitSetupDraft({
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
      setIsEditing(false);
      setDraftGroups([]);
      setDraftHoldings([]);
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
    setDraftHoldings((holdings) => holdings.filter((h) => h.groupClientKey !== clientKey));
  }

  function addDraftGroup() {
    setDraftGroups((groups) => [...groups, newDraftGroup(groups.length)]);
  }

  function reorderGroups(orderedClientKeys: string[]) {
    setDraftGroups((groups) => reorderDraftGroups(groups, orderedClientKeys));
  }

  function updateDraftHolding(clientKey: string, patch: Partial<DraftHolding>) {
    setDraftHoldings((holdings) => holdings.map((h) => (h.clientKey === clientKey ? { ...h, ...patch } : h)));
  }

  function deleteDraftHolding(clientKey: string) {
    setDraftHoldings((holdings) => holdings.filter((h) => h.clientKey !== clientKey));
  }

  function reorderHoldings(groupClientKey: string, orderedClientKeys: string[]) {
    setDraftHoldings((holdings) => reorderDraftHoldings(holdings, orderedClientKeys));
  }

  function submitHoldingForm(holding: NewHolding) {
    const groupHoldingCount = draftHoldings.filter((h) => h.groupClientKey === holding.groupId).length;
    setDraftHoldings((holdings) => [
      ...holdings,
      draftHoldingFromForm({ ...holding, sortOrder: groupHoldingCount }),
    ]);
    setAddingToGroupKey(null);
  }

  const groupSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleGroupDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const clientKeys = sortedDraftGroups.map((g) => g.clientKey);
    const oldIndex = clientKeys.indexOf(String(active.id));
    const newIndex = clientKeys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorderGroups(arrayMove(clientKeys, oldIndex, newIndex));
  }

  const sortedDraftGroups = [...draftGroups].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-xl font-semibold sm:text-2xl">포트폴리오 설정</h1>
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
                  disabled={isSaving || draftTargetSumOverLimit}
                  title={draftTargetSumOverLimit ? "자산군 목표 비중 합계가 100%를 넘으면 완료할 수 없습니다" : undefined}
                >
                  {isSaving ? "저장 중..." : "완료"}
                </Button>
              </div>
              {draftTargetSumOverLimit && (
                <span className="text-[11px] text-destructive">
                  자산군 목표 비중 합계가 {fmtPct(draftTargetSum)}로 100%를 초과했습니다
                </span>
              )}
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={startEditing}>
              수정
            </Button>
          ))}
      </div>

      {isError && <DataErrorNotice error={error} />}

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : isEditing ? (
        <>
          <DndContext sensors={groupSensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
            <SortableContext
              items={sortedDraftGroups.map((g) => g.clientKey)}
              strategy={verticalListSortingStrategy}
            >
              {sortedDraftGroups.map((group, index) => (
                <EditGroupCard
                  key={group.clientKey}
                  group={group}
                  color={groupColor(index, sortedDraftGroups.length)}
                  hue={hueForGroupIndex(index, sortedDraftGroups.length)}
                  holdings={draftHoldings
                    .filter((h) => h.groupClientKey === group.clientKey)
                    .sort((a, b) => a.sortOrder - b.sortOrder)}
                  groupOptions={sortedDraftGroups.map((g) => ({ id: g.clientKey, name: g.name }))}
                  prices={prices}
                  usdKrwRate={usdKrwRate}
                  onUpdate={(patch) => updateDraftGroup(group.clientKey, patch)}
                  onDelete={() => deleteDraftGroup(group.clientKey)}
                  onAddHolding={() => setAddingToGroupKey(group.clientKey)}
                  onUpdateHolding={updateDraftHolding}
                  onReorderHoldings={reorderHoldings}
                  onDeleteHolding={deleteDraftHolding}
                />
              ))}
            </SortableContext>
          </DndContext>

          <Button
            type="button"
            variant="outline"
            className="border-[1.5px] border-primary text-primary hover:bg-accent hover:text-accent-foreground"
            onClick={addDraftGroup}
          >
            + 자산군 추가
          </Button>

          <HoldingFormDialog
            open={addingToGroupKey !== null}
            onOpenChange={(open) => !open && setAddingToGroupKey(null)}
            groupOptions={sortedDraftGroups.map((g) => ({ id: g.clientKey, name: g.name }))}
            defaultGroupId={addingToGroupKey}
            onSubmit={submitHoldingForm}
          />
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
            />
          </div>

          {data.groups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </>
      )}
    </div>
  );
}
