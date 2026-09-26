import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AxisTabs, useAxisFromQuery } from "@/components/portfolio/AxisTabs";
import { AxisAllocationView } from "@/components/portfolio/AxisAllocationView";
import { AxisCategoryManagerDialog } from "@/components/portfolio/AxisCategoryManagerDialog";
import { RoleAllocationView } from "@/components/portfolio/RoleAllocationView";
import { DataErrorNotice } from "@/components/shared/DataErrorNotice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAddAxisCategory, useAxisCategories, useDeleteAxisCategory, useUpdateAxisCategory } from "@/hooks/useAxisCategories";
import { useAxisTargets, useSaveAxisTargets, targetsByBucket } from "@/hooks/useAxisTargets";
import { useRebalanceData } from "@/hooks/useRebalanceData";
import { computeAxisRebalance, MARKET_BUCKETS, marketBucketOf } from "@/lib/calc/axisRebalance";
import { fmtPct } from "@/lib/format";
import type { AxisCategoryType } from "@/types/domain";

export default function PortfolioPage() {
  const axis = useAxisFromQuery();
  const { data, isLoading, isError, error } = useRebalanceData();
  const axisTargetsQuery = useAxisTargets();
  const saveAxisTargets = useSaveAxisTargets();
  const roleCategoriesQuery = useAxisCategories("role");
  const sectorCategoriesQuery = useAxisCategories("sector");
  const addAxisCategory = useAddAxisCategory();
  const updateAxisCategory = useUpdateAxisCategory();
  const deleteAxisCategory = useDeleteAxisCategory();

  const roleCategories = useMemo(() => roleCategoriesQuery.data ?? [], [roleCategoriesQuery.data]);
  const sectorCategories = useMemo(() => sectorCategoriesQuery.data ?? [], [sectorCategoriesQuery.data]);

  const [isEditingMarket, setIsEditingMarket] = useState(false);
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftMarketTargets, setDraftMarketTargets] = useState<Record<string, number>>({});
  const [draftRoleTargets, setDraftRoleTargets] = useState<Record<string, number>>({});
  const [draftSectorTargets, setDraftSectorTargets] = useState<Record<string, number>>({});
  /** 역할 버킷 드래그 순서 draft — 옛 자산군 드래그와 같은 원칙으로, 목표% 편집
   * 모드 중에만 바뀌고 완료해야 저장된다(취소하면 버려짐). 빈 배열이면 저장된
   * 순서(`roleCategories`) 그대로 쓴다. */
  const [draftRoleOrder, setDraftRoleOrder] = useState<string[]>([]);
  const [managingCategories, setManagingCategories] = useState(false);

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
      targets: isEditingMarket ? draftMarketTargets : savedMarketTargets,
    });
  }, [data, isEditingMarket, draftMarketTargets, savedMarketTargets]);

  // 편집 모드 + 드래그로 순서를 바꾼 상태면 draft 순서대로, 아니면 저장된 sortOrder 그대로.
  const orderedRoleCategories = useMemo(() => {
    if (!isEditingRole || draftRoleOrder.length === 0) return roleCategories;
    const byId = new Map(roleCategories.map((c) => [c.id, c] as const));
    return draftRoleOrder.map((id) => byId.get(id)).filter((c): c is (typeof roleCategories)[number] => !!c);
  }, [roleCategories, isEditingRole, draftRoleOrder]);

  const roleResult = useMemo(() => {
    if (!data) return undefined;
    return computeAxisRebalance({
      holdings: data.holdings,
      buckets: orderedRoleCategories.map((c) => ({ key: c.id, label: c.name, description: c.description })),
      bucketOf: (h) => h.roleId,
      targets: isEditingRole
        ? draftRoleTargets
        : Object.fromEntries(orderedRoleCategories.map((c) => [c.id, c.targetPct])),
    });
  }, [data, orderedRoleCategories, isEditingRole, draftRoleTargets]);

  // 목표% 합계는 어떤 축이든 예외 없이 항상 정확히 100%여야 한다 — 0은 "미사용"으로
  // 봐주지 않는다. 안 쓸 거면 완료가 아니라 취소. (섹터는 역할에 종속된 느슨한 목표라
  // 이 규칙을 적용하지 않는다.)
  const draftMarketSum = Object.values(draftMarketTargets).reduce((sum, n) => sum + n, 0);
  const draftMarketSumInvalid = Math.abs(draftMarketSum - 100) >= 0.5;
  const draftRoleSum = Object.values(draftRoleTargets).reduce((sum, n) => sum + n, 0);
  const draftRoleSumInvalid = Math.abs(draftRoleSum - 100) >= 0.5;

  const isLocked = isEditingMarket || isEditingRole;

  function startEditingMarket() {
    setDraftMarketTargets(Object.fromEntries(MARKET_BUCKETS.map((b) => [b.key, savedMarketTargets[b.key] ?? 0])));
    setIsEditingMarket(true);
  }

  function cancelEditingMarket() {
    setIsEditingMarket(false);
    setDraftMarketTargets({});
  }

  async function finishEditingMarket() {
    setIsSaving(true);
    try {
      await saveAxisTargets.mutateAsync({ axis: "market", targets: draftMarketTargets });
      setIsEditingMarket(false);
      setDraftMarketTargets({});
    } catch (err) {
      console.error("Failed to save market axis targets", err);
      toast.error("저장 중 일부가 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingRole() {
    setDraftRoleTargets(Object.fromEntries(roleCategories.map((c) => [c.id, c.targetPct])));
    setDraftSectorTargets(Object.fromEntries(sectorCategories.map((c) => [c.id, c.targetPct])));
    setDraftRoleOrder(roleCategories.map((c) => c.id));
    setIsEditingRole(true);
  }

  function cancelEditingRole() {
    setIsEditingRole(false);
    setDraftRoleTargets({});
    setDraftSectorTargets({});
    setDraftRoleOrder([]);
  }

  async function finishEditingRole() {
    setIsSaving(true);
    try {
      const changedRoles = roleCategories.filter((c) => (draftRoleTargets[c.id] ?? 0) !== c.targetPct);
      const changedSectors = sectorCategories.filter((c) => (draftSectorTargets[c.id] ?? 0) !== c.targetPct);
      const reorderedRoles = draftRoleOrder.flatMap((id, index) => {
        const category = roleCategories.find((c) => c.id === id);
        return category && category.sortOrder !== index ? [{ id, sortOrder: index }] : [];
      });
      await Promise.all([
        ...changedRoles.map((c) =>
          updateAxisCategory.mutateAsync({ id: c.id, patch: { targetPct: draftRoleTargets[c.id] ?? 0 } }),
        ),
        ...changedSectors.map((c) =>
          updateAxisCategory.mutateAsync({ id: c.id, patch: { targetPct: draftSectorTargets[c.id] ?? 0 } }),
        ),
        ...reorderedRoles.map(({ id, sortOrder }) => updateAxisCategory.mutateAsync({ id, patch: { sortOrder } })),
      ]);
      setIsEditingRole(false);
      setDraftRoleTargets({});
      setDraftSectorTargets({});
      setDraftRoleOrder([]);
    } catch (err) {
      console.error("Failed to save role/sector targets", err);
      toast.error("저장 중 일부가 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddCategory(axisType: AxisCategoryType, name: string) {
    const list = axisType === "role" ? roleCategories : sectorCategories;
    try {
      await addAxisCategory.mutateAsync({ axis: axisType, name, description: null, targetPct: 0, sortOrder: list.length });
    } catch (err) {
      console.error("Failed to add axis category", err);
      toast.error("추가에 실패했습니다. 다시 시도해주세요.");
    }
  }

  async function handleUpdateCategory(id: string, patch: { name?: string; description?: string | null }) {
    try {
      await updateAxisCategory.mutateAsync({ id, patch });
    } catch (err) {
      console.error("Failed to update axis category", err);
      toast.error("저장에 실패했습니다. 다시 시도해주세요.");
    }
  }

  async function handleDeleteCategory(id: string) {
    try {
      await deleteAxisCategory.mutateAsync(id);
    } catch (err) {
      console.error("Failed to delete axis category", err);
      toast.error("삭제에 실패했습니다. 다시 시도해주세요.");
    }
  }

  // 드롭 즉시 저장(완료 버튼 없음) — 옛 AxisTabs 탭 순서 변경과 같은 패턴.
  async function handleReorderCategories(axisType: AxisCategoryType, orderedIds: string[]) {
    const list = axisType === "role" ? roleCategories : sectorCategories;
    try {
      await Promise.all(
        orderedIds.map((id, index) => {
          const category = list.find((c) => c.id === id);
          if (!category || category.sortOrder === index) return Promise.resolve();
          return updateAxisCategory.mutateAsync({ id, patch: { sortOrder: index } });
        }),
      );
    } catch (err) {
      console.error("Failed to reorder axis categories", err);
      toast.error("순서 저장에 실패했습니다. 다시 시도해주세요.");
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-xl font-semibold sm:text-2xl">포트폴리오</h1>
          <p className="text-sm text-muted-foreground">역할 기준 목표 비중과, 각 역할 안의 섹터별 구성을 확인하세요.</p>
        </div>
        {data &&
          (axis === "market" ? (
            isEditingMarket ? (
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={cancelEditingMarket} disabled={isSaving}>
                    취소
                  </Button>
                  <Button
                    type="button"
                    onClick={finishEditingMarket}
                    disabled={isSaving || draftMarketSumInvalid}
                    title={draftMarketSumInvalid ? "목표 비중 합계가 100%가 아니면 완료할 수 없습니다" : undefined}
                  >
                    {isSaving ? "저장 중..." : "완료"}
                  </Button>
                </div>
                {draftMarketSumInvalid && (
                  <span className="text-[11px] text-destructive">
                    시장 목표 비중 합계가 {fmtPct(draftMarketSum)}입니다 (정확히 100%여야 함)
                  </span>
                )}
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={startEditingMarket} disabled={isLocked}>
                수정
              </Button>
            )
          ) : isEditingRole ? (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={cancelEditingRole} disabled={isSaving}>
                  취소
                </Button>
                <Button
                  type="button"
                  onClick={finishEditingRole}
                  disabled={isSaving || draftRoleSumInvalid}
                  title={draftRoleSumInvalid ? "역할 목표 비중 합계가 100%가 아니면 완료할 수 없습니다" : undefined}
                >
                  {isSaving ? "저장 중..." : "완료"}
                </Button>
              </div>
              {draftRoleSumInvalid && (
                <span className="text-[11px] text-destructive">
                  역할 목표 비중 합계가 {fmtPct(draftRoleSum)}입니다 (정확히 100%여야 함)
                </span>
              )}
            </div>
          ) : (
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="ghost" onClick={() => setManagingCategories(true)}>
                축 관리
              </Button>
              <Button type="button" variant="outline" onClick={startEditingRole} disabled={isLocked}>
                수정
              </Button>
            </div>
          ))}
      </div>

      <AxisTabs axis={axis} isLocked={isLocked} />

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
            isEditing={isEditingMarket}
            draftTargets={draftMarketTargets}
            onDraftTargetChange={(bucket, pct) => setDraftMarketTargets((t) => ({ ...t, [bucket]: pct }))}
            note={
              <p className="mb-4 text-xs text-muted-foreground">
                상장 시장이 아니라 <span className="font-medium text-foreground">실질 익스포저</span> 기준입니다 —
                국내 상장 미국 ETF는 &ldquo;미국&rdquo;, 현금·채권·원자재는 &ldquo;기타&rdquo;로 잡힙니다. 종목별
                값은 보유 종목 화면에서 바꿉니다.
              </p>
            }
          />
        )
      ) : (
        roleResult && (
          <RoleAllocationView
            result={roleResult}
            sectors={sectorCategories}
            isEditing={isEditingRole}
            draftRoleTargets={draftRoleTargets}
            onDraftRoleTargetChange={(roleId, pct) => setDraftRoleTargets((t) => ({ ...t, [roleId]: pct }))}
            draftSectorTargets={draftSectorTargets}
            onDraftSectorTargetChange={(sectorId, pct) => setDraftSectorTargets((t) => ({ ...t, [sectorId]: pct }))}
            onReorderRoles={setDraftRoleOrder}
          />
        )
      )}

      <AxisCategoryManagerDialog
        open={managingCategories}
        onOpenChange={setManagingCategories}
        roles={roleCategories}
        sectors={sectorCategories}
        onAdd={handleAddCategory}
        onUpdate={handleUpdateCategory}
        onDelete={handleDeleteCategory}
        onReorder={handleReorderCategories}
      />
    </div>
  );
}
