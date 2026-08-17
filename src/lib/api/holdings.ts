import type { SupabaseClient } from "@supabase/supabase-js";
import type { Holding, NewHolding, Region } from "@/types/domain";

interface HoldingRow {
  id: string;
  user_id: string;
  group_id: string;
  ticker: string | null;
  name: string;
  target_pct_in_group: number;
  qty: number;
  avg_price: number;
  account: string | null;
  region: Region;
  memo: string | null;
  sort_order: number;
  created_at: string;
}

const COLUMNS =
  "id, user_id, group_id, ticker, name, target_pct_in_group, qty, avg_price, account, region, memo, sort_order, created_at";

function toDomain(row: HoldingRow): Holding {
  return {
    id: row.id,
    userId: row.user_id,
    groupId: row.group_id,
    ticker: row.ticker,
    name: row.name,
    targetPctInGroup: Number(row.target_pct_in_group),
    qty: Number(row.qty),
    avgPrice: Number(row.avg_price),
    account: row.account,
    region: row.region,
    memo: row.memo,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function fetchHoldings(supabase: SupabaseClient): Promise<Holding[]> {
  const { data, error } = await supabase
    .from("holdings")
    .select(COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as HoldingRow[]).map(toDomain);
}

export async function insertHolding(
  supabase: SupabaseClient,
  holding: NewHolding,
): Promise<Holding> {
  const { data, error } = await supabase
    .from("holdings")
    .insert({
      group_id: holding.groupId,
      ticker: holding.ticker,
      name: holding.name,
      target_pct_in_group: holding.targetPctInGroup,
      qty: holding.qty,
      avg_price: holding.avgPrice,
      account: holding.account,
      region: holding.region,
      memo: holding.memo,
      sort_order: holding.sortOrder,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toDomain(data as HoldingRow);
}

export async function updateHolding(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<NewHolding>,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.groupId !== undefined) update.group_id = patch.groupId;
  if (patch.ticker !== undefined) update.ticker = patch.ticker;
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.targetPctInGroup !== undefined) update.target_pct_in_group = patch.targetPctInGroup;
  if (patch.qty !== undefined) update.qty = patch.qty;
  if (patch.avgPrice !== undefined) update.avg_price = patch.avgPrice;
  if (patch.account !== undefined) update.account = patch.account;
  if (patch.region !== undefined) update.region = patch.region;
  if (patch.memo !== undefined) update.memo = patch.memo;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;

  const { error } = await supabase.from("holdings").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteHolding(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("holdings").delete().eq("id", id);
  if (error) throw error;
}
