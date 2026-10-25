import { fmtQty } from "@/lib/format";
import { costKrwOf, type HoldingCalc } from "./rebalance";
import type { Holding } from "@/types/domain";

/** 손절라인 몇 %p 위부터 경고(노랑)로 볼지 — 손절 -40%면 -30%부터 경고. ADR-0064. */
export const STOP_LOSS_WARNING_MARGIN_PCT = 10;

/** 매매 계획 대비 현재 상태 신호. 우선순위는 위험 신호가 먼저다:
 * 손절라인 이탈 > 손절 경고 > 정찰병 미달. 계획이 없는 항목은 신호를 만들지 않는다 —
 * 목표가 비어 있는 종목에 가짜 신호가 뜨던 ADR-0024의 실수를 반복하지 않기 위해서다. */
export type TradePlanSignal = "STOP_LOSS" | "STOP_WARNING" | "SCOUT_UNFILLED";

/** 걸린 신호 전부를 우선순위 순으로 — 손절 이하와 손절 경고는 서로 배타적이지만, 정찰병
 * 미달은 그 둘과 동시에 걸릴 수 있다. 프리셋 칩은 "그 조건에 걸렸는가"로 거르므로 이
 * 목록을 쓰고, 행 색상은 맨 앞(가장 위험한 것) 하나만 쓴다. */
export function tradePlanSignals(
  holding: Pick<Holding, "scoutAmount" | "stopLossPct">,
  { returnPct, costKrw }: { returnPct: number; costKrw: number },
): TradePlanSignal[] {
  const signals: TradePlanSignal[] = [];
  if (holding.stopLossPct != null) {
    if (returnPct <= holding.stopLossPct) signals.push("STOP_LOSS");
    else if (returnPct <= holding.stopLossPct + STOP_LOSS_WARNING_MARGIN_PCT) signals.push("STOP_WARNING");
  }
  // 정찰병은 평가금이 아니라 투입 원가 기준 — 주가가 빠졌다고 이미 채운 정찰병이
  // 다시 "미달"로 바뀌면 안 된다. 계획 금액은 항상 원화라 원가도 원화로 받는다.
  if (holding.scoutAmount != null && costKrw < holding.scoutAmount) signals.push("SCOUT_UNFILLED");
  return signals;
}

/** HoldingCalc에서 바로 신호 목록을 구한다 — 매입금액(원가)은 표 매입금액 열과 같은
 * costKrwOf(실시간 환율)로 원화 환산한다. 표 행 색상과 프리셋 칩이 같은 판정을 쓴다. */
export function tradePlanSignalsOf(holding: HoldingCalc, usdKrwRate: number): TradePlanSignal[] {
  return tradePlanSignals(holding, { returnPct: holding.returnPct, costKrw: costKrwOf(holding, usdKrwRate) });
}

/** 표 행 배경색으로 쓸 신호 하나 — 우선순위가 가장 높은 것. */
export function tradePlanSignalOf(holding: HoldingCalc, usdKrwRate: number): TradePlanSignal | null {
  return tradePlanSignalsOf(holding, usdKrwRate)[0] ?? null;
}

/** `/holdings` 프리셋 필터 칩으로 노출하는 신호 — 손절 관련 칩은 사용자 요청으로 뺐다
 * (행 색상으로는 여전히 표시된다). */
export const TRADE_PLAN_PRESET_SIGNALS: TradePlanSignal[] = ["SCOUT_UNFILLED"];

export const TRADE_PLAN_SIGNAL_LABELS: Record<TradePlanSignal, string> = {
  STOP_LOSS: "손절라인 이하",
  STOP_WARNING: `손절라인 ${STOP_LOSS_WARNING_MARGIN_PCT}%p 이내`,
  SCOUT_UNFILLED: "정찰병 미달",
};

/** 행 배경 — 테마별로 명도를 따로 잡은 CSS 변수(`styles/globals.css`). */
export const TRADE_PLAN_SIGNAL_BG: Record<TradePlanSignal, string> = {
  STOP_LOSS: "var(--plan-stop-bg)",
  STOP_WARNING: "var(--plan-warn-bg)",
  SCOUT_UNFILLED: "var(--plan-scout-bg)",
};

/** 계획 금액(항상 원화)의 짧은 표기 — 입력 단위와 같은 만원 단위("500만", "0.5만"). */
export function fmtPlanAmount(n: number): string {
  return (n / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 4 }) + "만";
}

/** 매주 적립 요일 라벨 — dcaDay 1=월 … 7=일. */
export const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/** 적립 일정 표기 — "매월 25일 50만", "매주 월 2주", "매일 1만". 정한 부분만 붙인다. */
export function fmtDcaSchedule(
  holding: Pick<Holding, "dcaFrequency" | "dcaDay" | "dcaAmount" | "dcaQty">,
): string | null {
  const when =
    holding.dcaFrequency == null
      ? null
      : holding.dcaFrequency === "DAILY"
        ? "매일"
        : holding.dcaFrequency === "WEEKLY"
          ? `매주${holding.dcaDay != null ? ` ${WEEKDAY_LABELS[holding.dcaDay - 1]}` : ""}`
          : `매월${holding.dcaDay != null ? ` ${holding.dcaDay}일` : ""}`;
  const amount =
    holding.dcaAmount != null
      ? fmtPlanAmount(holding.dcaAmount)
      : holding.dcaQty != null
        ? `${fmtQty(holding.dcaQty)}주`
        : null;
  const parts = [when, amount].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** "최대매수금액/분할횟수" 표기(예: "500만/5"). 적립식이면 "적립식"(일정이 있으면
 * "적립식 (매월 25일 50만)"), 미정이면 "미정", 아무것도 안 정했으면 null. 분할 횟수 없이
 * 금액만 있으면 금액만 표시한다. 미정의 매수 전략 메모는 길어서 여기 안 넣는다. */
export function fmtMaxBuyPlan(
  holding: Pick<Holding, "maxBuyAmount" | "splitCount" | "isDca" | "maxUndecided" | "dcaFrequency" | "dcaDay" | "dcaAmount" | "dcaQty">,
): string | null {
  if (holding.isDca) {
    const schedule = fmtDcaSchedule(holding);
    return schedule ? `적립식 (${schedule})` : "적립식";
  }
  if (holding.maxUndecided) return "미정";
  if (holding.maxBuyAmount == null) return null;
  const amount = fmtPlanAmount(holding.maxBuyAmount);
  return holding.splitCount != null ? `${amount}/${holding.splitCount}` : amount;
}
