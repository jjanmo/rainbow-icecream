import type { Holding } from "@/types/domain";
import type { Execution } from "@/types/journal";
import { computeExecutionAmount } from "./cost";
import type { ClosedLot } from "./replay";

export interface CurrencyAmounts {
  buy: number;
  sell: number;
  realizedPnl: number;
}

function emptyAmounts(): CurrencyAmounts {
  return { buy: 0, sell: 0, realizedPnl: 0 };
}

/**
 * 날짜/월 단위 매매 요약 — 해외/국내/합계 3행 구조를 그대로 반영한다.
 * `domestic`/`foreignUsd`는 각자의 원래 통화 값(실현손익도 포함, ADR-0038 유지).
 * `foreignKrw`는 해외분을 체결일 환율로 환산한 참고값이고, `totalKrw`는
 * `domestic + foreignKrw`로 통화가 섞인 기간을 하나의 원화 숫자로 합친 참고값이다.
 */
export interface TradeSummary {
  domestic: CurrencyAmounts;
  foreignUsd: CurrencyAmounts;
  foreignKrw: CurrencyAmounts;
  totalKrw: CurrencyAmounts;
  /** 해외 체결 중 체결일 환율을 못 구한 게 있으면 선다 — foreignKrw/totalKrw가 과소집계됐다는 신호. */
  krwEquivalentIncomplete: boolean;
}

const EMPTY_SUMMARY: TradeSummary = {
  domestic: emptyAmounts(),
  foreignUsd: emptyAmounts(),
  foreignKrw: emptyAmounts(),
  totalKrw: emptyAmounts(),
  krwEquivalentIncomplete: false,
};

export function hasActivity(summary: TradeSummary): boolean {
  const { domestic, foreignUsd } = summary;
  return (
    domestic.buy !== 0 ||
    domestic.sell !== 0 ||
    domestic.realizedPnl !== 0 ||
    foreignUsd.buy !== 0 ||
    foreignUsd.sell !== 0 ||
    foreignUsd.realizedPnl !== 0
  );
}

/**
 * OPENING_BALANCE는 호출부에서 이미 걸러진 목록을 넘긴다고 가정한다
 * (executionsByDay 참고). rateForExecution은 해외 체결의 체결일 USD/KRW
 * 환율을 돌려준다 — 못 구하면 undefined를 반환해 그 체결의 환산분을 건너뛴다.
 */
export function summarizeExecutions(
  executions: Execution[],
  holdingById: Map<string, Holding>,
  closedLotByExecutionId: Map<string, ClosedLot>,
  rateForExecution?: (execution: Execution) => number | undefined,
): TradeSummary {
  return executions.reduce((s, e) => {
    const holding = holdingById.get(e.holdingId);
    if (!holding) return s;
    const { grossAmount, currency } = computeExecutionAmount({
      side: e.side,
      qty: e.qty,
      price: e.price,
      region: holding.region,
    });
    const pnl = e.side === "SELL" ? (closedLotByExecutionId.get(e.id)?.realizedPnl ?? 0) : 0;

    if (currency === "KRW") {
      const domestic = { ...s.domestic };
      const totalKrw = { ...s.totalKrw };
      if (e.side === "BUY") {
        domestic.buy += grossAmount;
        totalKrw.buy += grossAmount;
      } else {
        domestic.sell += grossAmount;
        domestic.realizedPnl += pnl;
        totalKrw.sell += grossAmount;
        totalKrw.realizedPnl += pnl;
      }
      return { ...s, domestic, totalKrw };
    }

    const rate = rateForExecution?.(e);
    const krwAmount = rate !== undefined ? grossAmount * rate : 0;
    const krwPnl = rate !== undefined ? pnl * rate : 0;

    const foreignUsd = { ...s.foreignUsd };
    const foreignKrw = { ...s.foreignKrw };
    const totalKrw = { ...s.totalKrw };
    if (e.side === "BUY") {
      foreignUsd.buy += grossAmount;
      foreignKrw.buy += krwAmount;
      totalKrw.buy += krwAmount;
    } else {
      foreignUsd.sell += grossAmount;
      foreignUsd.realizedPnl += pnl;
      foreignKrw.sell += krwAmount;
      foreignKrw.realizedPnl += krwPnl;
      totalKrw.sell += krwAmount;
      totalKrw.realizedPnl += krwPnl;
    }
    return { ...s, foreignUsd, foreignKrw, totalKrw, krwEquivalentIncomplete: s.krwEquivalentIncomplete || rate === undefined };
  }, EMPTY_SUMMARY);
}
