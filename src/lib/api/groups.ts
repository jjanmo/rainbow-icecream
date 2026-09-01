import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetGroup, NewAssetGroup } from "@/types/domain";

interface GroupRow {
  id: string;
  user_id: string;
  name: string;
  target_pct: number;
  sort_order: number;
  created_at: string;
}

const COLUMNS = "id, user_id, name, target_pct, sort_order, created_at";

function toDomain(row: GroupRow): AssetGroup {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    targetPct: Number(row.target_pct),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function fetchGroups(supabase: SupabaseClient): Promise<AssetGroup[]> {
  const { data, error } = await supabase
    .from("asset_groups")
    .select(COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as GroupRow[]).map(toDomain);
}

export async function insertGroup(
  supabase: SupabaseClient,
  group: NewAssetGroup,
): Promise<AssetGroup> {
  const { data, error } = await supabase
    .from("asset_groups")
    .insert({
      name: group.name,
      target_pct: group.targetPct,
      sort_order: group.sortOrder,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toDomain(data as GroupRow);
}

export async function updateGroup(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<NewAssetGroup>,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.targetPct !== undefined) update.target_pct = patch.targetPct;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;

  const { error } = await supabase.from("asset_groups").update(update).eq("id", id);
  if (error) throw error;
}

/**
 * 자산군을 삭제해도 그 안의 종목은 지우지 않는다 (ADR-0035). 종목의 `group_id`를
 * null로 비운다 — 활성/소프트삭제 구분 없이 전부. `group_id = null`의 의미는
 * "어떤 자산군에도 속하지 않음" 하나로 통일돼 있고(ADR-0059), 종목 소프트 삭제와
 * 자산군 삭제 두 경로가 모두 여기로 온다.
 *
 * `holdings.group_id`의 FK가 `on delete restrict`라 null로 비우기 전에 delete만
 * 하면 실패한다 — 그래서 update가 먼저다. 예전엔 실제 "미분류" 그룹을
 * find-or-create해서 활성 종목을 거기로 옮겼는데(ADR-0035/0057), "미분류" 자신을
 * 지우면 그 종목들이 갈 데가 없어 새 "미분류"가 끝없이 재생성되는 버그가 있었다.
 * 실제 그룹 row를 아예 없애니 그 문제가 원천적으로 사라진다 — "미분류"는 이제
 * `computeRebalance`가 group_id null 종목을 묶어 만드는 합성 버킷일 뿐이다.
 */
export async function deleteGroup(supabase: SupabaseClient, id: string): Promise<void> {
  const { error: clearError } = await supabase.from("holdings").update({ group_id: null }).eq("group_id", id);
  if (clearError) throw clearError;

  const { error } = await supabase.from("asset_groups").delete().eq("id", id);
  if (error) throw error;
}
