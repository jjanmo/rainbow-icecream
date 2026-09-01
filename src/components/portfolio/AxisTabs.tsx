import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { cn } from '@/lib/utils';
import type { AllocationAxis } from '@/types/domain';

const AXIS_LABELS: Record<AllocationAxis, string> = {
  group: '자산군',
  market: '시장',
};
const AXES = Object.keys(AXIS_LABELS) as AllocationAxis[];

/** URL 쿼리 `?axis=`에서 현재 축을 읽는다 — 없거나 이상한 값이면 자산군(기본). */
export function useAxisFromQuery(): AllocationAxis {
  const { query } = useRouter();
  const raw = Array.isArray(query.axis) ? query.axis[0] : query.axis;
  return raw === 'market' || raw === 'group' ? raw : 'group';
}

/** 축 전환 — 새 UI 프리미티브 대신 plain 세그먼트 버튼(ADR-0051, `/holdings`·`/journal`과 동일). */
export function AxisTabs({ axis }: { axis: AllocationAxis }) {
  const router = useRouter();
  const { isReady, pathname, query } = router;
  const rawAxis = Array.isArray(query.axis) ? query.axis[0] : query.axis;

  // 쿼리가 없거나 이상한 값이면 ?axis=group 을 URL에 채워 넣어 항상 명시 상태로 둔다
  // (useAxisFromQuery는 이미 'group'을 반환하므로 화면 깜빡임 없이 주소만 맞춰진다).
  useEffect(() => {
    if (!isReady) return;
    if (rawAxis === 'group' || rawAxis === 'market') return;
    void router.replace({ pathname, query: { axis: 'group' } }, undefined, { shallow: true });
  }, [isReady, rawAxis, pathname, router]);

  function select(next: AllocationAxis) {
    void router.replace({ pathname, query: { axis: next } }, undefined, { shallow: true });
  }

  return (
    <div className="mb-4 flex gap-1.5">
      {AXES.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => select(a)}
          className={cn(
            'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
            axis === a
              ? 'border-primary bg-accent text-accent-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          {AXIS_LABELS[a]}
        </button>
      ))}
    </div>
  );
}
