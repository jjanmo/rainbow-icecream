import type { Region } from "@/types/domain";
import type { Execution } from "@/types/journal";
import { computeExecutionAmount, currencyOf, isZeroQty, normalizeQty, roundCurrency } from "./cost";

/**
 * 리플레이가 필요한 종목의 고정 속성. 체결 자체에는 통화를 담지 않고 소속
 * holding 에서 읽는다 — 같은 종목의 체결이 서로 다른 통화일 수는 없다.
 */
export interface ReplayContext {
  region: Region;
}

export interface ClosedLot {
  executionId: string;
  closedAt: string;
  quantitySold: number;
  /** 매도 직전 평균매입가 (거래통화). */
  avgEntryPrice: number;
  exitPrice: number;
  /** 거래통화 기준(해외=USD, 국내=KRW). 원화로 환산하지 않는다 (ADR-0038). */
  realizedPnl: number;
  holdingDays: number;
  isFullExit: boolean;
}

export interface ReplayResult {
  /** holdings.qty 에 반영할 값. */
  qty: number;
  /** holdings.avg_price 에 반영할 값 (거래통화). */
  avgPrice: number;
  /** 총 취득원가 (거래통화). qty 가 0이면 반드시 0이다. */
  totalCost: number;
  closedLots: ClosedLot[];
  /** 매도 수량이 보유 수량을 넘어서는 체결. 비었으면 정상. */
  oversold: { executionId: string; executedAt: string; qty: number; available: number }[];
}

/**
 * 기초잔고(OPENING_BALANCE)는 날짜가 없으므로(ADR-0048) 날짜로 정렬할 수
 * 없다 — 대신 "종목이 갖고 있던 가장 처음 상태"라는 의미 그대로 항상 맨 앞에
 * 둔다. 종목당 기초잔고는 최대 1건이라(DB 유니크 인덱스) 나머지는 실제 매매
 * (NEW, 항상 날짜 있음)끼리 시간순으로 비교하면 된다.
 */
function byExecutedAtThenId(a: Execution, b: Execution) {
  const aOpening = a.intent === "OPENING_BALANCE";
  const bOpening = b.intent === "OPENING_BALANCE";
  if (aOpening !== bOpening) return aOpening ? -1 : 1;
  if (aOpening && bOpening) return a.id.localeCompare(b.id);
  const t = new Date(a.executedAt as string).getTime() - new Date(b.executedAt as string).getTime();
  if (t !== 0) return t;
  return a.id.localeCompare(b.id);
}

const MS_PER_DAY = 86_400_000;

/**
 * 보유일수는 **달력 날짜 차이**다. 경과 밀리초로 재면 09:32 에 사서 3일 뒤
 * 00:00 에 팔았을 때 2일로 나온다 — 사용자가 "3일 보유"라고 읽는 값과 어긋난다.
 */
function calendarDayDiff(fromIso: string, toIso: string): number {
  const utcDay = (iso: string) =>
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.max(0, Math.round((utcDay(toIso) - utcDay(fromIso)) / MS_PER_DAY));
}

/**
 * 체결 원장을 시간 순으로 되짚어 현재 보유 상태를 만든다 (ADR-0027).
 *
 * 취득원가는 **이동평균법**이다 — 국내 증권사 화면이 보여주는 값과 일치시키는
 * 게 우선이기 때문이다. 개별 매수 lot 을 지목하지 않으므로 매도 시점의 평균
 * 단가가 그대로 원가가 된다.
 *
 * 순수 함수다. 부분 재계산과 전체 재계산이 같은 결과를 내야 하므로(ADR-0032)
 * 입력 배열 밖의 어떤 상태도 참조하지 않는다.
 */
export function replayHolding(executions: Execution[], ctx: ReplayContext): ReplayResult {
  const currency = currencyOf(ctx.region);
  const ordered = [...executions].sort(byExecutedAtThenId);

  let qty = 0;
  let totalCost = 0;
  let openedAt: string | null = null;
  const closedLots: ClosedLot[] = [];
  const oversold: ReplayResult["oversold"] = [];

  for (const e of ordered) {
    const amount = computeExecutionAmount({ side: e.side, qty: e.qty, price: e.price, region: ctx.region });
    const execQty = normalizeQty(e.qty);

    if (e.side === "BUY") {
      if (isZeroQty(qty)) openedAt = e.executedAt;
      qty = normalizeQty(qty + execQty);
      totalCost += amount.grossAmount;
      continue;
    }

    // SELL — 기초잔고는 개념상 항상 BUY 방향이라 side가 SELL이면 반드시 실제
    // 매매(NEW)이고, NEW는 DB 제약상 executedAt이 항상 있다 (ADR-0048).
    const executedAt = e.executedAt as string;

    if (execQty - qty > QTY_TOLERANCE) {
      oversold.push({ executionId: e.id, executedAt, qty: execQty, available: qty });
      continue;
    }

    const avgPrice = isZeroQty(qty) ? 0 : totalCost / qty;
    const costOut = avgPrice * execQty;
    const proceeds = amount.grossAmount;

    qty = normalizeQty(qty - execQty);
    totalCost -= costOut;
    // 전량 매도면 부동소수 잔여를 남기지 않고 0으로 닫는다.
    if (isZeroQty(qty)) {
      qty = 0;
      totalCost = 0;
    }

    closedLots.push({
      executionId: e.id,
      closedAt: executedAt,
      quantitySold: execQty,
      avgEntryPrice: avgPrice,
      exitPrice: e.price,
      realizedPnl: proceeds - costOut,
      holdingDays: openedAt ? calendarDayDiff(openedAt, executedAt) : 0,
      isFullExit: qty === 0,
    });

    if (qty === 0) openedAt = null;
  }

  return {
    qty,
    avgPrice: isZeroQty(qty) ? 0 : totalCost / qty,
    totalCost: roundCurrency(totalCost, currency) === 0 && isZeroQty(qty) ? 0 : totalCost,
    closedLots,
    oversold,
  };
}

/** 매도 초과 판정 여유. 수량 정규화 오차보다 크고 실제 1주보다 훨씬 작다. */
const QTY_TOLERANCE = 1e-6;
