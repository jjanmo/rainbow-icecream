import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  HOLDING_PRESET_BG,
  HOLDING_PRESET_DESCRIPTIONS,
  HOLDING_PRESET_LABELS,
  HOLDING_PRESETS,
  type HoldingPreset,
} from '@/lib/calc/tradePlan';

/** 매매 계획 프리셋 필터 (ADR-0064) — 칩 하나를 누르면 그 조건에 걸린 종목만 남긴다.
 * 하나만 고를 수 있고, 같은 칩을 다시 누르면 풀린다. 위 필터 바(지역/역할/…)와는 AND로
 * 겹쳐 적용되고, 칩의 숫자도 그 필터를 먼저 적용한 뒤의 개수다. 칩 배경은 칩마다 다른 고정
 * 색이다(HOLDING_PRESET_BG). 조건 설명은 칩 hover 툴팁(title)과 줄 끝 "?" 팝오버 두 곳에 —
 * 모바일엔 hover가 없어서 팝오버가 필요하다. */
export function TradePlanPresetChips({
  value,
  onChange,
  counts,
}: {
  value: HoldingPreset | null;
  onChange: (value: HoldingPreset | null) => void;
  counts: Partial<Record<HoldingPreset, number>>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {HOLDING_PRESETS.map((preset) => {
        const active = value === preset;
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(active ? null : preset)}
            aria-pressed={active}
            title={HOLDING_PRESET_DESCRIPTIONS[preset]}
            // 배경은 항상 칩 고유색, 활성 여부는 테두리로만 구분한다 — 두께는 늘
            // 2px로 두고 색만 바꿔서 켜고 끌 때 칩 크기가 흔들리지 않게 한다.
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs text-foreground transition-colors',
              active ? 'border-foreground' : 'border-transparent hover:border-border',
            )}
            style={{ backgroundColor: HOLDING_PRESET_BG[preset] }}
          >
            {HOLDING_PRESET_LABELS[preset]}
            <span className="font-mono">{counts[preset] ?? 0}</span>
          </button>
        );
      })}
      <PresetHelp />
    </div>
  );
}

/** 칩마다 어떤 조건으로 거르는지 한 번에 보여주는 "?" — OpeningBalanceHelp와 같은 모양. */
function PresetHelp() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="프리셋 칩 조건 보기"
        className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-[10px] leading-none font-normal text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
      >
        ?
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-left">
        <PopoverHeader>
          <PopoverTitle className="text-[13px]">프리셋 칩 조건</PopoverTitle>
          <PopoverDescription render={<div />} className="flex flex-col gap-2 text-xs leading-relaxed">
            {HOLDING_PRESETS.map((preset) => (
              <div key={preset} className="flex flex-col gap-0.5">
                <span className="font-semibold text-foreground">{HOLDING_PRESET_LABELS[preset]}</span>
                <span>{HOLDING_PRESET_DESCRIPTIONS[preset]}</span>
              </div>
            ))}
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}
