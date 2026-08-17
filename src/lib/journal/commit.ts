import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAccountFeeRates,
  fetchExecutionsForHolding,
  insertExecution,
  softDeleteExecution,
  updateExecution,
} from "@/lib/api/executions";
import { updateHolding } from "@/lib/api/holdings";
import type { Holding } from "@/types/domain";
import type { AccountFeeRates, NewExecution } from "@/types/journal";
import { defaultMarketFor } from "./marketMeta";
import { replayHolding, type ReplayContext, type ReplayResult } from "./replay";

function contextFor(holding: Holding, rates: AccountFeeRates[]): ReplayContext {
  const rate = rates.find((r) => r.account === holding.account);
  return {
    region: holding.region,
    market: holding.market ?? defaultMarketFor(holding.region),
    assetType: holding.assetType,
    domesticFeeRate: rate?.domesticFeeRate,
    overseasFeeRate: rate?.overseasFeeRate,
  };
}

export class OversoldError extends Error {
  constructor(readonly detail: ReplayResult["oversold"]) {
    super("보유 수량보다 많이 매도하는 체결이 있습니다.");
    this.name = "OversoldError";
  }
}

/**
 * 한 종목의 체결을 전부 다시 읽어 보유 상태를 재계산하고 holdings 에 반영한다.
 *
 * 문서 원안은 "변경된 체결의 executedAt 이후 구간만" 부분 재계산하라고 했지만,
 * 이 앱은 1인용이고 한 종목의 체결 수가 수백 건을 넘기 어렵다. 전체 리플레이는
 * 부분 재계산과 결과가 같음이 보장되는 유일한 구현이므로(ADR-0032의 불변식),
 * 검증 대상 코드를 두 개 두지 않고 전체 리플레이 하나만 유지한다.
 *
 * 보유 수량이 음수가 되는 체결이 있으면 **아무것도 반영하지 않고** 던진다.
 */
export async function replayAndPersistHolding(
  supabase: SupabaseClient,
  holding: Holding,
  rates: AccountFeeRates[],
): Promise<ReplayResult> {
  const executions = await fetchExecutionsForHolding(supabase, holding.id);
  const result = replayHolding(executions, contextFor(holding, rates));
  if (result.oversold.length > 0) throw new OversoldError(result.oversold);

  if (result.qty !== holding.qty || result.avgPrice !== holding.avgPrice) {
    await updateHolding(supabase, holding.id, { qty: result.qty, avgPrice: result.avgPrice });
  }
  return result;
}

/**
 * 체결 저장 → 리플레이 → 보유 반영을 한 흐름으로 묶는다.
 *
 * Supabase 는 클라이언트에서 닿는 크로스 테이블 트랜잭션이 없다. 중간 실패 시
 * 체결은 남고 보유는 갱신되지 않을 수 있으므로, 실패하면 **직전에 넣은 체결을
 * 되돌린다**(soft delete). 그래야 다음 리플레이가 오염된 상태를 물려받지 않는다.
 */
export async function commitNewExecution(
  supabase: SupabaseClient,
  holding: Holding,
  execution: NewExecution,
): Promise<ReplayResult> {
  const rates = await fetchAccountFeeRates(supabase);
  const inserted = await insertExecution(supabase, execution);
  try {
    return await replayAndPersistHolding(supabase, holding, rates);
  } catch (err) {
    await softDeleteExecution(supabase, inserted.id).catch(() => {
      // 되돌리기까지 실패하면 원래 오류를 덮지 않는다 — 사용자에게는 원인이 더 중요하다.
    });
    throw err;
  }
}

export async function commitExecutionUpdate(
  supabase: SupabaseClient,
  holding: Holding,
  executionId: string,
  patch: Partial<NewExecution>,
): Promise<ReplayResult> {
  const rates = await fetchAccountFeeRates(supabase);
  await updateExecution(supabase, executionId, patch);
  return replayAndPersistHolding(supabase, holding, rates);
}

export async function commitExecutionDelete(
  supabase: SupabaseClient,
  holding: Holding,
  executionId: string,
): Promise<ReplayResult> {
  const rates = await fetchAccountFeeRates(supabase);
  await softDeleteExecution(supabase, executionId);
  return replayAndPersistHolding(supabase, holding, rates);
}
