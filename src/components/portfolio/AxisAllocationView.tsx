import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { AllocationDonutChart } from '@/components/shared/AllocationDonutChart';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { AxisBucketCalc, AxisRebalanceResult } from '@/lib/calc/axisRebalance';
import { diffColor } from '@/lib/calc/rebalance';
import { fmtPct, fmtSigned, fmtUsd, fmtWon } from '@/lib/format';

/**
 * `/portfolio`의 시장(실질지역) 축 화면 — 목표/실제 도넛 한 쌍 + 버킷별 목표%/실제%/
 * 차이/조정금 행, 펼치면 그 버킷에 속한 종목 목록(읽기 전용). 읽기+편집 모드 둘 다에
 * 쓰인다(목표% 인라인 입력, `isEditing`). 역할 축은 섹터가 역할 버킷 안에 중첩돼야
 * 해서 이 컴포넌트를 그대로 못 쓰고 `RoleAllocationView`를 따로 둔다 (ADR-0062).
 */
export function AxisAllocationView({
  result,
  isEditing,
  draftTargets,
  onDraftTargetChange,
  note,
}: {
  result: AxisRebalanceResult;
  isEditing: boolean;
  /** 편집 모드에서 버킷별 목표% (draft). */
  draftTargets: Record<string, number>;
  onDraftTargetChange: (bucket: string, pct: number) => void;
  /** 축 설명 문구 등, 도넛 아래에 끼워 넣을 것. */
  note?: ReactNode;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const targetOf = (b: AxisBucketCalc) => (isEditing ? (draftTargets[b.key] ?? 0) : b.targetPct);
  const draftSum = result.buckets.reduce((sum, b) => sum + (draftTargets[b.key] ?? 0), 0);
  const shownSum = isEditing ? draftSum : result.targetSum;
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

      {note}

      {result.excludedMembers.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          미배정 {fmtPct((result.excludedValue / (result.includedValue + result.excludedValue)) * 100)} (
          {result.excludedMembers.length}종목) — 위 비중은 이 탭에 배정된 종목만으로 계산한 값입니다.
        </p>
      )}

      {result.buckets.map((bucket) => (
        <BucketCard
          key={bucket.key}
          bucket={bucket}
          isEditing={isEditing}
          draftTarget={draftTargets[bucket.key] ?? 0}
          onDraftTargetChange={(pct) => onDraftTargetChange(bucket.key, pct)}
        />
      ))}
    </>
  );
}

function BucketCard({
  bucket,
  isEditing,
  draftTarget,
  onDraftTargetChange,
}: {
  bucket: AxisBucketCalc;
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

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-5 sm:p-6">
      <div className={`flex flex-wrap items-center gap-3 ${expanded ? 'pb-2' : ''}`}>
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

      {expanded && <BucketHoldingsList bucket={bucket} />}
    </div>
  );
}

function BucketHoldingsList({ bucket }: { bucket: AxisBucketCalc }) {
  const members = bucket.members;

  return (
    <div className="pt-2">
      {members.length === 0 && (
        <p className="border-t border-border py-3 text-center text-xs text-muted-foreground">이 버킷에 속한 종목이 없습니다.</p>
      )}
      {members.map((h) => {
        const isOverseas = h.nativeCurrency === 'USD';
        const pctInBucket = bucket.value > 0 ? (h.value / bucket.value) * 100 : 0;
        return (
          <div
            key={h.id}
            className="flex w-full items-center gap-2.5 border-t border-border py-1.5 text-left text-xs first:border-t-0"
          >
            <span className="w-14 shrink-0 truncate font-mono text-muted-foreground">{h.ticker ?? ''}</span>
            <span className="flex-1 truncate">{h.name}</span>
            <span className="w-16 shrink-0 truncate text-right text-muted-foreground">{h.account || '-'}</span>
            <span className="w-52 shrink-0 text-right font-mono">
              {fmtWon(h.value)}
              {isOverseas && <span className="ml-1 text-muted-foreground">({fmtUsd(h.valueNative)})</span>}
            </span>
            <span className="w-12 shrink-0 text-right font-mono text-muted-foreground">{fmtPct(pctInBucket)}</span>
          </div>
        );
      })}

      {members.length > 0 && (
        <div className="mt-1 flex items-end gap-4 border-t border-border pt-2">
          <span className="mr-auto text-[11px] text-muted-foreground">합계</span>
          <span className="flex w-32 flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground">목표</span>
            <span className="font-mono text-sm">{fmtWon(bucket.value + bucket.actionAmount)}</span>
          </span>
          <span className="flex w-32 flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground">평가금</span>
            <span className="font-mono text-sm">{fmtWon(bucket.value)}</span>
          </span>
          <span className="flex w-32 flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground">조정금</span>
            <span className="text-flavor-mango font-mono text-sm font-bold">
              {bucket.actionAmount >= 0 ? '+' : '-'}
              {fmtWon(Math.abs(bucket.actionAmount))}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
