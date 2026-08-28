import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchExecutionsForHolding,
  insertExecution,
  softDeleteExecution,
  updateExecution,
} from "@/lib/api/executions";
import { deleteHolding, updateHolding } from "@/lib/api/holdings";
import type { Holding } from "@/types/domain";
import type { Execution, NewExecution } from "@/types/journal";
import { replayHolding, type ReplayContext, type ReplayResult } from "./replay";

function contextFor(holding: Holding): ReplayContext {
  return { region: holding.region };
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
): Promise<ReplayResult> {
  const executions = await fetchExecutionsForHolding(supabase, holding.id);
  const result = replayHolding(executions, contextFor(holding));
  if (result.oversold.length > 0) throw new OversoldError(result.oversold);

  if (result.qty !== holding.qty || result.avgPrice !== holding.avgPrice) {
    await updateHolding(supabase, holding.id, { qty: result.qty, avgPrice: result.avgPrice });
  }

  // 전량 매도로 수량이 0이 되면 보유종목에서도 자동으로 정리한다. 재매수는
  // 항상 "+ 새 종목"으로 새로 입력받는다 — 자산군이 바뀔 수 있어 이전 종목의
  // 설정을 이어받지 않는 게 맞다고 판단했다(사용자 결정). 그래서 여기서 되살리는
  // 로직은 두지 않는다 — deleted_at을 지우는 건 여전히 DB에서 직접 처리해야
  // 한다(ADR-0045). 이미 삭제된 상태면 건드리지 않는다.
  if (result.qty === 0 && !holding.deletedAt) {
    await deleteHolding(supabase, holding.id);
  }
  return result;
}

/**
 * 체결 저장 → 리플레이 → 보유 반영을 한 흐름으로 묶는다.
 *
 * Supabase 는 클라이언트에서 닿는 크로스 테이블 트랜잭션이 없다. 중간 실패 시
 * 체결은 남고 보유는 갱신되지 않을 수 있으므로, 실패하면 **직전에 넣은 체결을
 * 되돌린다**(soft delete). 그래야 다음 리플레이가 오염된 상태를 물려받지 않는다.
 *
 * 생성된 체결도 함께 반환한다 — 매도 시 그 체결에 붙는 EXECUTION 노트를 저장하려면
 * 호출부(journal.tsx)가 새로 생긴 execution.id를 알아야 한다.
 */
export async function commitNewExecution(
  supabase: SupabaseClient,
  holding: Holding,
  execution: NewExecution,
): Promise<{ execution: Execution; replay: ReplayResult }> {
  const inserted = await insertExecution(supabase, execution);
  try {
    const replay = await replayAndPersistHolding(supabase, holding);
    return { execution: inserted, replay };
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
  await updateExecution(supabase, executionId, patch);
  return replayAndPersistHolding(supabase, holding);
}

export async function commitExecutionDelete(
  supabase: SupabaseClient,
  holding: Holding,
  executionId: string,
): Promise<ReplayResult> {
  // 지우기 전에 "이 체결 없이" 먼저 리플레이해 oversold가 나는지 미리 확인한다
  // (예: 기초잔고를 지웠는데 그 수량에 기대던 매도가 남아있는 경우). commitNewExecution과
  // 달리 여긴 실패 시 되돌리는 로직이 없어서, 먼저 softDeleteExecution부터 하면
  // "삭제에 실패했습니다" 토스트가 뜨는데 실제로는 DB에서 이미 지워진 상태가 되는
  // 버그가 있었다 — 그래서 DB에 아무것도 쓰기 전에 dry-run으로 먼저 막는다.
  const remaining = (await fetchExecutionsForHolding(supabase, holding.id)).filter((e) => e.id !== executionId);
  const dryRun = replayHolding(remaining, contextFor(holding));
  if (dryRun.oversold.length > 0) throw new OversoldError(dryRun.oversold);

  await softDeleteExecution(supabase, executionId);
  return replayAndPersistHolding(supabase, holding);
}
