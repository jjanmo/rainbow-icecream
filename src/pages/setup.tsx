import { useState } from "react";
import { toast } from "sonner";
import { AllocationBar } from "@/components/setup/AllocationBar";
import { EditGroupCard } from "@/components/setup/EditGroupCard";
import { GroupCard } from "@/components/setup/GroupCard";
import { DataErrorNotice } from "@/components/shared/DataErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAddGroup, useDeleteGroup, useUpdateGroup } from "@/hooks/useGroups";
import { useAddHolding, useDeleteHolding, useUpdateHolding } from "@/hooks/useHoldings";
import { useRebalanceData } from "@/hooks/useRebalanceData";
import { FLAVOR_HEXES } from "@/lib/calc/color";
import { fmtPct } from "@/lib/format";
import {
  commitSetupDraft,
  newDraftGroup,
  newDraftHolding,
  toDraftGroup,
  toDraftHolding,
  type DraftGroup,
  type DraftHolding,
} from "@/lib/setupDraft";

export default function SetupPage() {
  const { data, isLoading, isError, error } = useRebalanceData();
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

  const targetSumOk = data ? Math.abs(data.targetSum - 100) < 0.5 : true;
  const filledSum = data
    ? data.groups.reduce((sum, g) => sum + (g.targetPct * g.memberTargetSum) / 100, 0)
    : 0;
  const filledSumOk = data ? Math.abs(filledSum - 100) < 0.5 : true;

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

  function updateDraftGroup(clientKey: string, patch: Partial<Pick<DraftGroup, "name" | "targetPct" | "flavorIndex">>) {
    setDraftGroups((groups) => groups.map((g) => (g.clientKey === clientKey ? { ...g, ...patch } : g)));
  }

  function deleteDraftGroup(clientKey: string) {
    setDraftGroups((groups) => groups.filter((g) => g.clientKey !== clientKey));
    setDraftHoldings((holdings) => holdings.filter((h) => h.groupClientKey !== clientKey));
  }

  function addDraftGroup() {
    setDraftGroups((groups) => [...groups, newDraftGroup(groups.length % FLAVOR_HEXES.length)]);
  }

  function updateDraftHolding(
    clientKey: string,
    patch: Partial<Pick<DraftHolding, "ticker" | "name" | "targetPctInGroup">>,
  ) {
    setDraftHoldings((holdings) => holdings.map((h) => (h.clientKey === clientKey ? { ...h, ...patch } : h)));
  }

  function deleteDraftHolding(clientKey: string) {
    setDraftHoldings((holdings) => holdings.filter((h) => h.clientKey !== clientKey));
  }

  function addDraftHolding(groupClientKey: string) {
    setDraftHoldings((holdings) => [...holdings, newDraftHolding(groupClientKey)]);
  }

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
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" onClick={cancelEditing} disabled={isSaving}>
                취소
              </Button>
              <Button type="button" onClick={finishEditing} disabled={isSaving}>
                {isSaving ? "저장 중..." : "완료"}
              </Button>
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
          {draftGroups.map((group) => (
            <EditGroupCard
              key={group.clientKey}
              group={group}
              holdings={draftHoldings.filter((h) => h.groupClientKey === group.clientKey)}
              onUpdate={(patch) => updateDraftGroup(group.clientKey, patch)}
              onDelete={() => deleteDraftGroup(group.clientKey)}
              onAddHolding={() => addDraftHolding(group.clientKey)}
              onUpdateHolding={updateDraftHolding}
              onDeleteHolding={deleteDraftHolding}
            />
          ))}

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
          <div className="mb-6 rounded-lg border border-border bg-card px-5 py-4">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[12.5px] text-muted-foreground">목표 배분 (자산군)</span>
              {targetSumOk ? (
                <Badge className="bg-accent text-accent-foreground">정상</Badge>
              ) : (
                <Badge variant="destructive">
                  100%까지 {fmtPct(Math.abs(data.targetSum - 100), 0)} 남음 ({fmtPct(data.targetSum, 0)})
                </Badge>
              )}
            </div>
            <AllocationBar groups={data.groups} widthOf={(g) => g.targetPct} />

            <div className="mb-1.5 mt-4 flex items-center gap-2">
              <span className="text-[12.5px] text-muted-foreground">실제 채워짐 (종목까지)</span>
              {filledSumOk ? (
                <Badge className="bg-accent text-accent-foreground">정상</Badge>
              ) : (
                <Badge variant="destructive">
                  100%까지 {fmtPct(Math.abs(100 - filledSum), 0)} 남음 ({fmtPct(filledSum, 0)})
                </Badge>
              )}
            </div>
            <AllocationBar
              groups={data.groups}
              widthOf={(g) => (g.targetPct * g.memberTargetSum) / 100}
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
