import type { SupabaseClient } from "@supabase/supabase-js";
import type { Execution, ExecutionIntent, NewExecution, Side } from "@/types/journal";

interface ExecutionRow {
  id: string;
  user_id: string;
  holding_id: string;
  side: Side;
  intent: ExecutionIntent;
  executed_at: string;
  qty: number;
  price: number;
  created_at: string;
}

const COLUMNS = "id, user_id, holding_id, side, intent, executed_at, qty, price, created_at";

function toDomain(row: ExecutionRow): Execution {
  return {
    id: row.id,
    userId: row.user_id,
    holdingId: row.holding_id,
    side: row.side,
    intent: row.intent,
    executedAt: row.executed_at,
    qty: Number(row.qty),
    price: Number(row.price),
    createdAt: row.created_at,
  };
}

function toRow(execution: NewExecution) {
  return {
    holding_id: execution.holdingId,
    side: execution.side,
    intent: execution.intent,
    executed_at: execution.executedAt,
    qty: execution.qty,
    price: execution.price,
  };
}

/**
 * 삭제된 체결은 기본적으로 제외한다 — soft delete 라서 필터를 빠뜨리면 조용히
 * 틀린다 (ADR-0032). 삭제 포함 조회가 필요하면 별도 함수로 노출한다.
 */
export async function fetchExecutions(supabase: SupabaseClient): Promise<Execution[]> {
  const { data, error } = await supabase
    .from("executions")
    .select(COLUMNS)
    .is("deleted_at", null)
    .order("executed_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ExecutionRow[]).map(toDomain);
}

export async function fetchExecutionsForHolding(
  supabase: SupabaseClient,
  holdingId: string,
): Promise<Execution[]> {
  const { data, error } = await supabase
    .from("executions")
    .select(COLUMNS)
    .eq("holding_id", holdingId)
    .is("deleted_at", null)
    .order("executed_at", { ascending: true });
  if (error) throw error;
  return (data as ExecutionRow[]).map(toDomain);
}

export async function insertExecution(
  supabase: SupabaseClient,
  execution: NewExecution,
): Promise<Execution> {
  const { data, error } = await supabase.from("executions").insert(toRow(execution)).select(COLUMNS).single();
  if (error) throw error;
  return toDomain(data as ExecutionRow);
}

export async function updateExecution(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<NewExecution>,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.side !== undefined) update.side = patch.side;
  if (patch.intent !== undefined) update.intent = patch.intent;
  if (patch.executedAt !== undefined) update.executed_at = patch.executedAt;
  if (patch.qty !== undefined) update.qty = patch.qty;
  if (patch.price !== undefined) update.price = patch.price;

  const { error } = await supabase.from("executions").update(update).eq("id", id);
  if (error) throw error;
}

/** 물리 삭제하지 않는다 — 지우면 "어제 본 수익률이 왜 달라졌는가"를 설명할 수 없다. */
export async function softDeleteExecution(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from("executions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
