import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetType, Holding, NewHolding, Region } from "@/types/domain";

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
  asset_type: AssetType;
  sort_order: number;
  deleted_at: string | null;
  created_at: string;
}

const COLUMNS =
  "id, user_id, group_id, ticker, name, target_pct_in_group, qty, avg_price, account, region, asset_type, sort_order, deleted_at, created_at";

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
    assetType: row.asset_type,
    sortOrder: row.sort_order,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

/** 삭제된(deleted_at 있는) 종목은 기본적으로 제외한다 — 매매일지·비중 체크·설정
 * 화면 전부 이 함수 하나로 종목을 읽으므로, 여기서 걸러두면 나머지는 신경 쓸
 * 필요가 없다 (executions의 deleted_at 필터와 같은 패턴, ADR-0032/0045). */
export async function fetchHoldings(supabase: SupabaseClient): Promise<Holding[]> {
  const { data, error } = await supabase
    .from("holdings")
    .select(COLUMNS)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as HoldingRow[]).map(toDomain);
}

/** 삭제된 것까지 포함한 전체 종목 — 매매일지가 히스토리 조회(종목 모드, 기간
 * 모드의 종목명 표시)에 쓴다. `/holdings`·`/portfolio`·`/rebalance`는 "지금 보유
 * 중인 포트폴리오"를 보여줘야 하므로 계속 fetchHoldings(활성만)를 쓴다 — 이
 * 함수와 섞어 쓰지 않는다. */
export async function fetchAllHoldings(supabase: SupabaseClient): Promise<Holding[]> {
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
      asset_type: holding.assetType,
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
  if (patch.assetType !== undefined) update.asset_type = patch.assetType;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;

  const { error } = await supabase.from("holdings").update(update).eq("id", id);
  if (error) throw error;
}

/** 소프트 삭제 — executions/trade_notes는 그대로 둔다. 같은 종목을 나중에 다시
 * 매수하면 예전 매매 기록·메모를 이어서 볼 수 있어야 하기 때문이다 (ADR-0045).
 * 하드 삭제(구 동작)는 holdings.holding_id의 on delete cascade 때문에 그 기록을
 * 영구히 지워버렸다. */
export async function deleteHolding(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("holdings").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
