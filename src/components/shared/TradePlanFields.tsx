import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { ReactNode } from 'react';
import { WEEKDAY_LABELS } from '@/lib/calc/tradePlan';
import { cn } from '@/lib/utils';
import { DCA_FREQUENCY_LABELS, type DcaFrequency, type TradePlan } from '@/types/domain';

/** 금액은 만원 단위로 입력받고 DB에는 원 단위로 저장한다 — 원가 비교·표시 로직은
 * 전부 원 단위 그대로 두고, 단위 변환은 이 파일의 초안 ↔ 값 경계에서만 한다. */
const MANWON = 10000;

/** 최대 매수 금액을 어떻게 다룰지 — 셋 중 하나만(DB의 is_dca/max_undecided가 동시에 true일
 * 수 없는 것과 같은 규칙). CAP이 기본값: 최대 매수 금액/분할을 직접 정한다. */
export type BudgetMode = 'CAP' | 'DCA' | 'UNDECIDED';

const BUDGET_MODE_LABELS: Record<BudgetMode, string> = {
  CAP: '최대 금액 지정',
  DCA: '적립식',
  UNDECIDED: '최대 금액 미정',
};

/** 1회 적립 단위 — 금액(만원)이나 주수(주) 중 하나. */
export type DcaUnit = 'AMOUNT' | 'SHARES';

/** 입력 중인 문자열 초안 — 숫자 state에 바로 묶으면 앞자리 0 버그가 생기므로
 * (UI 컨벤션) 문자열로 들고 있다가 저장할 때 파싱한다. */
export interface TradePlanDraft {
  scoutText: string;
  maxBuyText: string;
  splitText: string;
  budgetMode: BudgetMode;
  undecidedMemo: string;
  dcaFrequency: DcaFrequency | null;
  /** 매주일 때 요일(1~7). */
  dcaWeekday: number | null;
  /** 매월일 때 날짜(1~31) 입력 문자열. */
  dcaMonthDayText: string;
  dcaUnit: DcaUnit;
  /** 1회 적립 값 — 단위가 금액이면 만원, 주수면 주. */
  dcaValueText: string;
  stopLossText: string;
}

export const EMPTY_TRADE_PLAN_DRAFT: TradePlanDraft = {
  scoutText: '',
  maxBuyText: '',
  splitText: '',
  budgetMode: 'CAP',
  undecidedMemo: '',
  dcaFrequency: null,
  dcaWeekday: null,
  dcaMonthDayText: '',
  dcaUnit: 'AMOUNT',
  dcaValueText: '',
  stopLossText: '',
};

export function toTradePlanDraft(plan: TradePlan): TradePlanDraft {
  const str = (n: number | null) => (n == null ? '' : String(n));
  const manwon = (n: number | null) => (n == null ? '' : String(n / MANWON));
  return {
    scoutText: manwon(plan.scoutAmount),
    maxBuyText: manwon(plan.maxBuyAmount),
    splitText: str(plan.splitCount),
    budgetMode: plan.isDca ? 'DCA' : plan.maxUndecided ? 'UNDECIDED' : 'CAP',
    undecidedMemo: plan.undecidedMemo ?? '',
    dcaFrequency: plan.dcaFrequency,
    dcaWeekday: plan.dcaFrequency === 'WEEKLY' ? plan.dcaDay : null,
    dcaMonthDayText: plan.dcaFrequency === 'MONTHLY' ? str(plan.dcaDay) : '',
    dcaUnit: plan.dcaQty != null ? 'SHARES' : 'AMOUNT',
    dcaValueText: plan.dcaQty != null ? str(plan.dcaQty) : manwon(plan.dcaAmount),
    stopLossText: str(plan.stopLossPct),
  };
}

/** 빈 칸·0·숫자가 아닌 값은 전부 "정하지 않음"(null)으로 본다. */
function parsePositive(text: string): number | null {
  const n = parseFloat(text.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 만원 단위 입력 → 원. 1.15 × 10000 같은 곱셈이 부동소수 오차로 11499.999…가 되므로
 * 원 단위로 반올림한다. */
function parseManwon(text: string): number | null {
  const n = parsePositive(text);
  return n == null ? null : Math.round(n * MANWON);
}

/** 주기에 맞는 적립일만 남긴다 — 매일은 날짜가 없고, 범위를 벗어난 날짜는 "미정"(null). */
function parseDcaDay(draft: TradePlanDraft): number | null {
  if (draft.dcaFrequency === 'WEEKLY') return draft.dcaWeekday;
  if (draft.dcaFrequency === 'MONTHLY') {
    const day = Math.round(parsePositive(draft.dcaMonthDayText) ?? 0);
    return day >= 1 && day <= 31 ? day : null;
  }
  return null;
}

export function parseTradePlanDraft(draft: TradePlanDraft): TradePlan {
  const split = parsePositive(draft.splitText);
  // 적립 일정은 적립식일 때만, 전략 메모는 미정일 때만 저장한다 — 체크를 풀면 같이 지운다.
  // 적립식·미정이면 최대금액/분할은 의미가 없으니 저장하지 않는다.
  const isDca = draft.budgetMode === 'DCA';
  const maxUndecided = draft.budgetMode === 'UNDECIDED';
  const noCap = draft.budgetMode !== 'CAP';
  const dca = isDca && draft.dcaFrequency != null;
  const memo = draft.undecidedMemo.trim();
  // 손절라인은 "-40"이든 "40"이든 손실 쪽 수익률로 받아들인다.
  const stopLoss = parsePositive(draft.stopLossText.replace('-', ''));
  return {
    scoutAmount: parseManwon(draft.scoutText),
    maxBuyAmount: noCap ? null : parseManwon(draft.maxBuyText),
    splitCount: noCap || split == null ? null : Math.round(split),
    isDca,
    maxUndecided,
    undecidedMemo: maxUndecided && memo ? memo : null,
    dcaFrequency: dca ? draft.dcaFrequency : null,
    dcaDay: dca ? parseDcaDay(draft) : null,
    // 고른 단위 쪽만 채운다 — DB에서도 둘이 동시에 채워질 수 없다.
    dcaAmount: isDca && draft.dcaUnit === 'AMOUNT' ? parseManwon(draft.dcaValueText) : null,
    dcaQty: isDca && draft.dcaUnit === 'SHARES' ? parsePositive(draft.dcaValueText) : null,
    stopLossPct: stopLoss == null ? null : -stopLoss,
  };
}

const INPUT_CLASS =
  'h-8 w-full rounded-md border border-input bg-transparent px-2 font-mono text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/** 정찰병·최대매수금액/분할·손절라인 입력 블록 (ADR-0064) — 매매 모달("+ 새 종목",
 * 기존 종목 "변경")과 `/holdings` 편집 다이얼로그가 같이 쓴다. 전부 선택 입력이다.
 * 금액은 지역과 무관하게 항상 원화(만원 단위)로 받는다 — 해외 종목도 계획은 원화로 세운다. */
export function TradePlanFieldsBlock({
  draft,
  onChange,
}: {
  draft: TradePlanDraft;
  onChange: (draft: TradePlanDraft) => void;
}) {
  const set = (patch: Partial<TradePlanDraft>) => onChange({ ...draft, ...patch });
  const textInput = (value: string, onValue: (v: string) => void) => (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => onValue(e.target.value)}
      className={INPUT_CLASS}
    />
  );

  return (
    <div className="flex flex-col gap-2.5 border-t border-dashed border-border pt-2.5">
      <span className="text-[11px] font-semibold text-muted-foreground">매매 계획 (선택)</span>
      <div className="flex gap-2.5">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label className="text-[11px]">정찰병 최대 금액 (만원)</Label>
          {textInput(draft.scoutText, (scoutText) => set({ scoutText }))}
        </div>
        <div className="flex w-24 flex-col gap-1.5">
          <Label className="text-[11px]">손절라인 (%)</Label>
          {textInput(draft.stopLossText, (stopLossText) => set({ stopLossText }))}
        </div>
      </div>
      <RadioGroup
        value={draft.budgetMode}
        onValueChange={(v) => set({ budgetMode: v as BudgetMode })}
        className="flex flex-wrap items-center gap-4"
      >
        {(Object.keys(BUDGET_MODE_LABELS) as BudgetMode[]).map((mode) => (
          <label key={mode} className="flex items-center gap-1.5 text-xs">
            <RadioGroupItem value={mode} />
            {BUDGET_MODE_LABELS[mode]}
          </label>
        ))}
      </RadioGroup>
      {draft.budgetMode === 'CAP' && (
        <div className="flex items-end gap-2.5">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label className="text-[11px]">최대 매수 금액 (만원)</Label>
            {textInput(draft.maxBuyText, (maxBuyText) => set({ maxBuyText }))}
          </div>
          <div className="flex w-24 flex-col gap-1.5">
            <Label className="text-[11px]">분할 횟수</Label>
            {textInput(draft.splitText, (splitText) => set({ splitText }))}
          </div>
        </div>
      )}
      {draft.budgetMode === 'DCA' && <DcaScheduleFields draft={draft} set={set} textInput={textInput} />}
      {draft.budgetMode === 'UNDECIDED' && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px]">매수 전략 메모</Label>
          <Textarea
            value={draft.undecidedMemo}
            onChange={(e) => set({ undecidedMemo: e.target.value })}
            rows={3}
            className="max-h-32 resize-none text-xs"
          />
        </div>
      )}
    </div>
  );
}

/** 적립식 일정 — 언제(주기 + 요일/날짜)·얼마나(1회 금액). 전부 선택 입력이라 주기를 안
 * 고르면 "적립식이지만 일정 미정"으로 저장된다. 같은 주기를 다시 누르면 선택이 풀린다. */
function DcaScheduleFields({
  draft,
  set,
  textInput,
}: {
  draft: TradePlanDraft;
  set: (patch: Partial<TradePlanDraft>) => void;
  textInput: (value: string, onValue: (v: string) => void) => ReactNode;
}) {
  const chip = (selected: boolean) =>
    cn(
      'h-7 rounded-md border px-2 text-[11px] transition-colors',
      selected ? 'border-primary bg-accent font-semibold text-accent-foreground' : 'border-border text-muted-foreground hover:text-foreground',
    );

  return (
    <div className="flex flex-col gap-2.5 rounded-md bg-muted/40 p-2.5">
      <div className="flex flex-col gap-1.5">
        <Label className="text-[11px]">적립 주기</Label>
        <div className="flex gap-1.5">
          {(Object.keys(DCA_FREQUENCY_LABELS) as DcaFrequency[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => set({ dcaFrequency: draft.dcaFrequency === f ? null : f })}
              className={chip(draft.dcaFrequency === f)}
            >
              {DCA_FREQUENCY_LABELS[f]}
            </button>
          ))}
        </div>
      </div>
      {draft.dcaFrequency === 'WEEKLY' && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px]">요일</Label>
          <div className="flex flex-wrap gap-1">
            {WEEKDAY_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => set({ dcaWeekday: draft.dcaWeekday === i + 1 ? null : i + 1 })}
                className={cn(chip(draft.dcaWeekday === i + 1), 'w-8 px-0')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2.5">
        {draft.dcaFrequency === 'MONTHLY' && (
          <div className="flex w-24 flex-col gap-1.5">
            <Label className="text-[11px]">날짜 (1~31일)</Label>
            {textInput(draft.dcaMonthDayText, (dcaMonthDayText) => set({ dcaMonthDayText }))}
          </div>
        )}
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px]">1회 적립 {draft.dcaUnit === 'AMOUNT' ? '금액 (만원)' : '주수 (주)'}</Label>
            <RadioGroup
              value={draft.dcaUnit}
              onValueChange={(v) => set({ dcaUnit: v as DcaUnit })}
              className="flex w-auto items-center gap-3"
            >
              {(['AMOUNT', 'SHARES'] as DcaUnit[]).map((unit) => (
                <label key={unit} className="flex items-center gap-1 text-[11px]">
                  <RadioGroupItem value={unit} />
                  {unit === 'AMOUNT' ? '금액' : '주수'}
                </label>
              ))}
            </RadioGroup>
          </div>
          {textInput(draft.dcaValueText, (dcaValueText) => set({ dcaValueText }))}
        </div>
      </div>
    </div>
  );
}
