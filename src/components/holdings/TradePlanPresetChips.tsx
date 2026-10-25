import { cn } from '@/lib/utils';
import {
  TRADE_PLAN_SIGNAL_BG,
  TRADE_PLAN_SIGNAL_LABELS,
  TRADE_PLAN_PRESET_SIGNALS,
  type TradePlanSignal,
} from '@/lib/calc/tradePlan';

/** 매매 계획 신호 프리셋 필터 (ADR-0064) — 칩 하나를 누르면 그 신호에 걸린 종목만 남긴다.
 * 하나만 고를 수 있고, 같은 칩을 다시 누르면 풀린다. 위 필터 바(지역/역할/…)와는 AND로
 * 겹쳐 적용되고, 칩의 숫자도 그 필터를 먼저 적용한 뒤의 개수다. 칩 배경이 표 행 배경과
 * 같은 색이라 범례를 겸한다. */
export function TradePlanPresetChips({
  value,
  onChange,
  counts,
}: {
  value: TradePlanSignal | null;
  onChange: (value: TradePlanSignal | null) => void;
  counts: Partial<Record<TradePlanSignal, number>>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TRADE_PLAN_PRESET_SIGNALS.map((signal) => {
        const active = value === signal;
        return (
          <button
            key={signal}
            type="button"
            onClick={() => onChange(active ? null : signal)}
            aria-pressed={active}
            // 배경은 항상 표 행과 같은 신호색, 활성 여부는 테두리로만 구분한다 — 두께는 늘
            // 2px로 두고 색만 바꿔서 켜고 끌 때 칩 크기가 흔들리지 않게 한다.
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs text-foreground transition-colors',
              active ? 'border-foreground' : 'border-transparent hover:border-border',
            )}
            style={{ backgroundColor: TRADE_PLAN_SIGNAL_BG[signal] }}
          >
            {TRADE_PLAN_SIGNAL_LABELS[signal]}
            <span className="font-mono">{counts[signal] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
