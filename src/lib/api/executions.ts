import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountFeeRates, Execution, ExecutionIntent, NewExecution, Side } from "@/types/journal";

interface ExecutionRow {
  id: string;
  user_id: string;
  holding_id: string;
  side: Side;
  intent: ExecutionIntent;
  executed_at: string;
  qty: number;
  price: number;
  fx_rate: number;
  fee_amount: number;
  tax_amount: number;
  applied_fee_rate: number;
  applied_tax_rate: number;
  cost_overridden: boolean;
  created_at: string;
}

const COLUMNS =
  "id, user_id, holding_id, side, intent, executed_at, qty, price, fx_rate, fee_amount, tax_amount, applied_fee_rate, applied_tax_rate, cost_overridden, created_at";

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
    fxRate: Number(row.fx_rate),
    feeAmount: Number(row.fee_amount),
    taxAmount: Number(row.tax_amount),
    appliedFeeRate: Number(row.applied_fee_rate),
    appliedTaxRate: Number(row.applied_tax_rate),
    costOverridden: row.cost_overridden,
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
    fx_rate: execution.fxRate,
    fee_amount: execution.feeAmount,
    tax_amount: execution.taxAmount,
    applied_fee_rate: execution.appliedFeeRate,
    applied_tax_rate: execution.appliedTaxRate,
    cost_overridden: execution.costOverridden,
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
  if (patch.fxRate !== undefined) update.fx_rate = patch.fxRate;
  if (patch.feeAmount !== undefined) update.fee_amount = patch.feeAmount;
  if (patch.taxAmount !== undefined) update.tax_amount = patch.taxAmount;
  if (patch.appliedFeeRate !== undefined) update.applied_fee_rate = patch.appliedFeeRate;
  if (patch.appliedTaxRate !== undefined) update.applied_tax_rate = patch.appliedTaxRate;
  if (patch.costOverridden !== undefined) update.cost_overridden = patch.costOverridden;

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

export async function fetchAccountFeeRates(supabase: SupabaseClient): Promise<AccountFeeRates[]> {
  const { data, error } = await supabase
    .from("account_fee_rates")
    .select("account, domestic_fee_rate, overseas_fee_rate");
  if (error) throw error;
  return (data as { account: string; domestic_fee_rate: number; overseas_fee_rate: number }[]).map((r) => ({
    account: r.account,
    domesticFeeRate: Number(r.domestic_fee_rate),
    overseasFeeRate: Number(r.overseas_fee_rate),
  }));
}
