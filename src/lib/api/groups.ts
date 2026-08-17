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

/** Group name holdings land in when their own group is deleted. Found by name
 * (no dedicated flag column needed) — see findOrCreateUnclassifiedGroup. */
const UNCLASSIFIED_GROUP_NAME = "미분류";

/**
 * Finds this user's "미분류" group, creating one if it doesn't exist yet.
 * `excludeId` skips a candidate with that id — needed when deleting a group
 * that happens to already be named "미분류" itself, so reassignment doesn't
 * just point holdings back at the group about to be deleted.
 */
async function findOrCreateUnclassifiedGroup(supabase: SupabaseClient, excludeId?: string): Promise<string> {
  let query = supabase.from("asset_groups").select("id").eq("name", UNCLASSIFIED_GROUP_NAME).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("asset_groups")
    .insert({ name: UNCLASSIFIED_GROUP_NAME, target_pct: 0, sort_order: 0 })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}

/**
 * 자산군을 삭제해도 그 안의 종목은 지우지 않는다 — "미분류" 자산군으로
 * 옮긴다(find-or-create). `holdings.group_id`의 FK가 `on delete restrict`라
 * 재배정 없이 delete만 하면 그대로 실패한다.
 */
export async function deleteGroup(supabase: SupabaseClient, id: string): Promise<void> {
  const { data: members, error: fetchError } = await supabase
    .from("holdings")
    .select("id")
    .eq("group_id", id);
  if (fetchError) throw fetchError;

  if (members && members.length > 0) {
    const unclassifiedId = await findOrCreateUnclassifiedGroup(supabase, id);
    const { error: reassignError } = await supabase
      .from("holdings")
      .update({ group_id: unclassifiedId })
      .eq("group_id", id);
    if (reassignError) throw reassignError;
  }

  const { error } = await supabase.from("asset_groups").delete().eq("id", id);
  if (error) throw error;
}
