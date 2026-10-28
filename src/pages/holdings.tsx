import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { HoldingFormDialog } from '@/components/holdings/HoldingFormDialog';
import { HoldingsHeatmap, type HeatmapBucketOf } from '@/components/holdings/HoldingsHeatmap';
import { HoldingsTable } from '@/components/holdings/HoldingsTable';
import { TradePlanPresetChips } from '@/components/holdings/TradePlanPresetChips';
import { ALL_HOLDINGS_FILTER, HoldingsFilterBar, matchesHoldingsFilter, type HoldingsFilter } from '@/components/holdings/HoldingsFilterBar';
import { DataErrorNotice } from '@/components/shared/DataErrorNotice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAxisCategories } from '@/hooks/useAxisCategories';
import { useDailyReturns } from '@/hooks/useDailyReturns';
import { useHigh52w } from '@/hooks/useHigh52w';
import { useAddHolding, useDeleteHolding, useUpdateHolding } from '@/hooks/useHoldings';
import { useRebalanceData } from '@/hooks/useRebalanceData';
import { colorFor, hueForGroupIndex } from '@/lib/calc/color';
import { drawdownFrom52wHigh } from '@/lib/calc/high52w';
import type { HoldingCalc } from '@/lib/calc/rebalance';
import { holdingPresetsOf, type HoldingPreset } from '@/lib/calc/tradePlan';
import { buildHoldingsMarkdownTable } from '@/lib/holdingsExport';
import type { Holding, NewHolding } from '@/types/domain';
import { cn, downloadTextFile } from '@/lib/utils';

type HoldingsView = 'table' | 'heatmap';
const VIEW_LABELS: Record<HoldingsView, string> = { table: '목록', heatmap: '히트맵' };

export default function HoldingsPage() {
  const { data, usdKrwRate, isLoading, isError, error } = useRebalanceData();
  const addHolding = useAddHolding();
  const updateHolding = useUpdateHolding();
  const deleteHolding = useDeleteHolding();
  const roleCategoriesQuery = useAxisCategories('role');
  const sectorCategoriesQuery = useAxisCategories('sector');

  const [filter, setFilter] = useState<HoldingsFilter>(ALL_HOLDINGS_FILTER);
  const [preset, setPreset] = useState<HoldingPreset | null>(null);
  const [view, setView] = useState<HoldingsView>('table');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holding | null>(null);

  const roleCategories = useMemo(() => roleCategoriesQuery.data ?? [], [roleCategoriesQuery.data]);
  const sectorCategories = useMemo(() => sectorCategoriesQuery.data ?? [], [sectorCategoriesQuery.data]);

  const roleNameById = useMemo(() => {
    const map = new Map<string, string>();
    roleCategories.forEach((r) => map.set(r.id, r.name));
    return map;
  }, [roleCategories]);
  const sectorNameById = useMemo(() => {
    const map = new Map<string, string>();
    sectorCategories.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [sectorCategories]);

  // 52주 고점은 필터와 무관하게 보유 종목 전체로 조회한다 — 필터를 바꿀 때마다 쿼리 키가
  // 바뀌어 다시 묻지 않도록. 서버에서 하루 단위로 캐시된다(ADR-0065).
  const allTickers = useMemo(
    () => (data?.holdings ?? []).map((h) => h.ticker).filter((t): t is string => t !== null),
    [data],
  );
  const high52wQuery = useHigh52w(allTickers);
  // 52주 고점 대비 하락률 — 표의 "52주 고점 대비" 열과 프리셋 칩이 같은 값을 쓰도록 여기서 한 번만 계산한다.
  const drawdownById = useMemo(
    () =>
      new Map(
        (data?.holdings ?? []).map((h) => [
          h.id,
          h.ticker ? drawdownFrom52wHigh(high52wQuery.data?.[h.ticker], h.priceNative, h.hasLivePrice) : null,
        ]),
      ),
    [data, high52wQuery.data],
  );

  // 필터 바(지역/역할/…)를 먼저 적용한 결과 — 프리셋 칩의 개수는 이 기준으로 센다.
  const barFilteredHoldings = useMemo(() => {
    if (!data) return [];
    return data.holdings.filter((h) => matchesHoldingsFilter(h, filter));
  }, [data, filter]);
  // 프리셋 칩(정찰병·정찰병추매·추매시점1·적립식)은 행 색상(가장 위험한 신호 하나)이 아니라 "그 조건에
  // 걸렸는가"로 거른다 — holdingPresetsOf 참고.
  const presetsById = useMemo(
    () =>
      new Map(
        barFilteredHoldings.map((h) => [
          h.id,
          holdingPresetsOf(h, usdKrwRate, drawdownById.get(h.id)?.drawdownPct ?? null),
        ]),
      ),
    [barFilteredHoldings, usdKrwRate, drawdownById],
  );
  const presetCounts = useMemo(() => {
    const counts: Partial<Record<HoldingPreset, number>> = {};
    presetsById.forEach((presets) => presets.forEach((p) => (counts[p] = (counts[p] ?? 0) + 1)));
    return counts;
  }, [presetsById]);
  const filteredHoldings = useMemo(
    () => (preset ? barFilteredHoldings.filter((h) => presetsById.get(h.id)?.includes(preset)) : barFilteredHoldings),
    [barFilteredHoldings, presetsById, preset],
  );

  const accountOptions = useMemo(() => {
    const values = (data?.holdings ?? []).map((h) => h.account).filter((a): a is string => !!a && a.trim().length > 0);
    return [...new Set(values)].sort();
  }, [data]);

  // 히트맵은 역할 기준으로 depth-1 그룹핑한다 — 역할은 이제 종목의 고정 속성이라
  // (ADR-0062/0063), 예전처럼 "포트폴리오 탭을 먼저 선택해야" 하는 제약이 없다.
  // 역할 자체가 사용자가 추가/삭제하는 동적 목록이 됐으므로 색은 그 목록의 순서로 파생한다.
  const roleColorByRoleId = useMemo(() => {
    const map = new Map<string, string>();
    roleCategories.forEach((r, i) => map.set(r.id, colorFor(hueForGroupIndex(i, roleCategories.length), 0)));
    return map;
  }, [roleCategories]);
  const heatmapBucketOf: HeatmapBucketOf = (h: HoldingCalc) => {
    if (!h.roleId) return null;
    return {
      id: h.roleId,
      name: roleNameById.get(h.roleId) ?? '',
      color: roleColorByRoleId.get(h.roleId) ?? 'oklch(70% 0 0)',
    };
  };

  const heatmapTickers = useMemo(
    () => filteredHoldings.map((h) => h.ticker).filter((t): t is string => t !== null),
    [filteredHoldings],
  );
  const dailyReturnsQuery = useDailyReturns(heatmapTickers, view === 'heatmap');

  function openAddModal() {
    setEditingHolding(null);
    setModalOpen(true);
  }

  function openEditModal(holding: Holding) {
    setEditingHolding(holding);
    setModalOpen(true);
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    deleteHolding.mutate(deleteTarget.id);
    setDeleteTarget(null);
  }

  function handleDownload() {
    const content = buildHoldingsMarkdownTable(filteredHoldings, roleNameById, sectorNameById);
    downloadTextFile(`보유종목_${new Date().toISOString().slice(0, 10)}.md`, content);
  }

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-xl font-semibold sm:text-2xl">보유 종목</h1>
          <p className="text-sm text-muted-foreground">보유 중인 종목을 직접 관리하세요.</p>
        </div>
        <Button onClick={openAddModal}>+ 종목 추가</Button>
      </div>

      {isError && <DataErrorNotice error={error} />}

      {isLoading || !data ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : (
        <>
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            <HoldingsFilterBar
              filter={filter}
              onChange={setFilter}
              roleOptions={roleCategories}
              sectorOptions={sectorCategories}
              accountOptions={accountOptions}
            />
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-muted-foreground">총 {filteredHoldings.length}개 종목</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={filteredHoldings.length === 0}
              >
                <Download className="size-4" />
                다운로드
              </Button>
            </div>
          </div>

          <div className="mb-3.5">
            <TradePlanPresetChips value={preset} onChange={setPreset} counts={presetCounts} />
          </div>

          <div className="mb-3.5 flex gap-1.5">
            {(Object.keys(VIEW_LABELS) as HoldingsView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
                  view === v
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          {view === 'table' ? (
            <HoldingsTable
              rows={filteredHoldings}
              usdKrwRate={usdKrwRate}
              drawdownById={drawdownById}
              high52wLoading={high52wQuery.isLoading}
              onEdit={openEditModal}
              onDelete={(id) => {
                const h = data.holdings.find((holding) => holding.id === id);
                if (h) setDeleteTarget(h);
              }}
            />
          ) : (
            <HoldingsHeatmap
              holdings={filteredHoldings}
              bucketOf={heatmapBucketOf}
              dailyChangeByTicker={dailyReturnsQuery.data ?? {}}
              isLoadingDailyChanges={dailyReturnsQuery.isLoading}
            />
          )}
        </>
      )}

      <HoldingFormDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialHolding={editingHolding as NewHolding | null}
        onSubmit={(holding) => {
          if (editingHolding) {
            updateHolding.mutate({ id: editingHolding.id, patch: holding });
          } else {
            // 새 종목은 항상 수량 0으로 시작한다 — 매매일지의 첫 체결이 채운다 (ADR-0044).
            addHolding.mutate({ ...holding, qty: 0, avgPrice: 0 });
          }
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.name} 삭제</AlertDialogTitle>
            <AlertDialogDescription>목록에서 사라지지만, 이 종목의 매매 기록·메모는 삭제되지 않습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
