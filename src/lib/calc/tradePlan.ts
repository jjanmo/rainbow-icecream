import { fmtQty } from "@/lib/format";
import { hueForGroupIndex } from "./color";
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

/** 행 배경 — 테마별로 명도를 따로 잡은 CSS 변수(`styles/globals.css`). 손절 신호만 칠한다 —
 * 정찰병 미달 행 배경(하늘색)은 사용자 요청으로 뺐다(프리셋 칩으로만 거른다). */
export const TRADE_PLAN_SIGNAL_BG: Partial<Record<TradePlanSignal, string>> = {
  STOP_LOSS: "var(--plan-stop-bg)",
  STOP_WARNING: "var(--plan-warn-bg)",
};

/** `/holdings` 프리셋 필터 칩. 신호(정찰병 미달)와 계획 속성(적립식), 시세 조건(52주 고점
 * 대비 하락)이 섞여 있어서 TradePlanSignal과 별개 타입으로 둔다 — 정찰병 미달 외에는 행 색상이
 * 없는 순수 필터다. 손절 관련 칩은 사용자 요청으로 뺐다(행 색상으로는 여전히 표시된다).
 * - SCOUT_DIP(정찰병추매): 정찰병 미달이면서 52주 고점 대비 SCOUT_DIP_THRESHOLD_PCT 이하로 빠진
 *   종목 — "정찰병을 채울 만큼 눌렸는가"를 한 번에 거르는 칩.
 * - ADD_BUY_1(추매시점1): 정찰병은 채웠지만 최대 금액엔 아직 못 미친 종목(정찰병 금액 ≤ 원가 <
 *   최대 매수 금액) 중에서, 52주 고점 대비와 수익률이 둘 다 ADD_BUY_1_THRESHOLD_PCT 이하로 빠진
 *   종목. 정찰병 금액이나 최대 매수 금액을 안 정한 종목(적립식·미정 포함)은 판단할 수 없어 제외.
 * - HOLD(홀드): 원가가 최대 매수 금액 이상 — 더 사지 않고 들고 가는 종목. ADD_BUY_1의 "원가 <
 *   최대"와 경계가 맞물리도록 같은 값은 홀드 쪽에 넣는다. 최대 매수 금액이 없으면 제외. */
export type HoldingPreset = "SCOUT_UNFILLED" | "SCOUT_DIP" | "ADD_BUY_1" | "HOLD" | "DCA";

/** SCOUT_DIP 칩 기준 — 52주 고점 대비 하락률이 이 값 이하(%, 경계 포함, 아래쪽 제한 없음). */
export const SCOUT_DIP_THRESHOLD_PCT = -5;

/** ADD_BUY_1 칩 기준 — 52주 고점 대비 하락률과 수익률이 둘 다 이 값 이하(%, 경계 포함). */
export const ADD_BUY_1_THRESHOLD_PCT = -10;

export const HOLDING_PRESETS: HoldingPreset[] = ["SCOUT_UNFILLED", "SCOUT_DIP", "ADD_BUY_1", "HOLD", "DCA"];

export const HOLDING_PRESET_LABELS: Record<HoldingPreset, string> = {
  SCOUT_UNFILLED: "정찰병",
  SCOUT_DIP: "정찰병추매",
  ADD_BUY_1: "추매시점1",
  HOLD: "홀드",
  DCA: "적립식",
};

/** 칩 조건 설명 — 칩 hover 툴팁과 칩 줄 끝 "?" 팝오버가 같이 쓴다. 기준값은 상수에서 만든다. */
export const HOLDING_PRESET_DESCRIPTIONS: Record<HoldingPreset, string> = {
  SCOUT_UNFILLED: "매입금액이 정찰병 금액보다 적은 종목",
  SCOUT_DIP: `정찰병 미달이면서 52주 고점 대비 ${SCOUT_DIP_THRESHOLD_PCT}% 이하 구간인 종목`,
  ADD_BUY_1: `정찰병 금액 ≤ 매입금액 < 최대 매수 금액이면서, 52주 고점 대비와 수익률이 둘 다 ${ADD_BUY_1_THRESHOLD_PCT}% 이하인 종목`,
  HOLD: "매입금액이 최대 매수 금액 이상인 종목(최대 금액을 넘어선 종목)",
  DCA: "매매 계획에서 적립식으로 정한 종목",
};

/** 칩 배경 — 칩마다 서로 다른 색. 칩 순서대로 색상환을 균등하게 나눠(hueForGroupIndex) 고정
 * 색을 정한다(진짜 랜덤이면 새로고침마다 색이 바뀌어 헷갈린다). 반투명 틴트라 라이트/다크 테마
 * 모두 기본 글자색 위에서 읽힌다. 칩을 추가하면 색이 다시 고르게 나눠진다. */
export const HOLDING_PRESET_BG = Object.fromEntries(
  HOLDING_PRESETS.map((p, i) => [p, `oklch(70% 0.13 ${hueForGroupIndex(i, HOLDING_PRESETS.length)} / 0.3)`]),
) as Record<HoldingPreset, string>;

/** 종목이 걸리는 프리셋 전부 — 신호는 행 색상(최우선 하나)이 아니라 조건 충족 여부로 본다.
 * 정찰병 미달이면서 손절 경고인 종목도 "정찰병 미달" 칩에 나와야 하기 때문이다.
 * `drawdownPct`는 52주 고점 대비 하락률(drawdownFrom52wHigh) — 값이 없으면(현금성·조회 실패·
 * 로딩 중) null이고, 그때는 고점 조건이 있는 칩(SCOUT_DIP·ADD_BUY_1)에 걸리지 않는다(0%로
 * 취급하지 않는다). 수익률은 표 수익률 열과 같은 `returnPct`(종목 통화 기준)를 쓴다. */
export function holdingPresetsOf(
  holding: HoldingCalc,
  usdKrwRate: number,
  drawdownPct: number | null,
): HoldingPreset[] {
  const presets: HoldingPreset[] = [];
  const scoutUnfilled = tradePlanSignalsOf(holding, usdKrwRate).includes("SCOUT_UNFILLED");
  if (scoutUnfilled) {
    presets.push("SCOUT_UNFILLED");
    if (drawdownPct != null && drawdownPct <= SCOUT_DIP_THRESHOLD_PCT) {
      presets.push("SCOUT_DIP");
    }
  }
  const scoutFilled = holding.scoutAmount != null && !scoutUnfilled;
  // 최대 금액 지정 모드에서 금액을 정했을 때만 판단한다 — 적립식·미정은 maxBuyAmount가 null이다.
  const maxBuy = holding.maxBuyAmount;
  const hasMax = maxBuy != null;
  const belowMax = maxBuy != null && costKrwOf(holding, usdKrwRate) < maxBuy;
  if (
    scoutFilled &&
    belowMax &&
    drawdownPct != null &&
    drawdownPct <= ADD_BUY_1_THRESHOLD_PCT &&
    holding.returnPct <= ADD_BUY_1_THRESHOLD_PCT
  ) {
    presets.push("ADD_BUY_1");
  }
  if (hasMax && !belowMax) presets.push("HOLD");
  if (holding.isDca) presets.push("DCA");
  return presets;
}

/** 계획 금액(항상 원화)의 짧은 표기 — 입력 단위와 같은 만원 단위("500만", "0.5만"). */
export function fmtPlanAmount(n: number): string {
  return (n / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 4 }) + "만";
}

/** 매주 적립 요일 라벨 — dcaDay 1=월 … 7=일. */
export const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/** 적립 일정 표기 — "매월 25일 50만", "매주 월 2주", "매일 1만". 정한 부분만 붙인다.
 * `unitWon`이면 금액을 "50만원"처럼 원까지 붙인다(보유 종목 표 표기). */
export function fmtDcaSchedule(
  holding: Pick<Holding, "dcaFrequency" | "dcaDay" | "dcaAmount" | "dcaQty">,
  { unitWon = false }: { unitWon?: boolean } = {},
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
      ? fmtPlanAmount(holding.dcaAmount) + (unitWon ? "원" : "")
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

/** `/holdings` 표 "매매 계획" 열의 표기 — 포맷만 봐도 방식이 구분된다:
 * - 최대 금액 지정(CAP): 2줄 — 1줄 정찰병 금액 "50만원"(안 정했으면 null), 2줄 "200만원(150만원)"
 *   — 괄호는 최대 금액 − 매입금액(남은 한도, 넘었으면 음수)
 * - 적립식(DCA): 1줄 "매월 25일 50만원" / "매주 월 2주" / "매일 1만원" (일정을 안 정했으면 "적립식")
 * 최대 금액 미정·계획 없음·최대 금액 미입력은 null(빈 칸). 손절라인은 행 색상이 이미 보여주므로
 * 넣지 않는다. 매입금액은 표 매입금액 열과 같은 원화 환산값(costKrwOf)을 받는다. */
export type BuyPlanCell = { kind: "CAP"; scout: string | null; max: string } | { kind: "DCA"; text: string };

export function buyPlanCell(
  holding: Pick<
    Holding,
    "scoutAmount" | "maxBuyAmount" | "isDca" | "maxUndecided" | "dcaFrequency" | "dcaDay" | "dcaAmount" | "dcaQty"
  >,
  costKrw: number,
): BuyPlanCell | null {
  if (holding.isDca) return { kind: "DCA", text: fmtDcaSchedule(holding, { unitWon: true }) ?? "적립식" };
  if (holding.maxUndecided || holding.maxBuyAmount == null) return null;
  // 남은 한도는 원 단위 원가에서 나온 값이라 만원 소수가 길어지므로 소수 1자리까지만.
  // 반올림하면 0이 되는 작은 음수는 "-0"으로 보이지 않게 0으로 맞춘다.
  const raw = (holding.maxBuyAmount - costKrw) / 10000;
  const remaining = Math.abs(raw) < 0.05 ? 0 : raw;
  const remainingText = remaining.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  return {
    kind: "CAP",
    scout: holding.scoutAmount != null ? `${fmtPlanAmount(holding.scoutAmount)}원` : null,
    max: `${fmtPlanAmount(holding.maxBuyAmount)}원(${remainingText}만원)`,
  };
}
