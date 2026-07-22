import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetGroup, NewAssetGroup } from "@/types/domain";

interface GroupRow {
  id: string;
  user_id: string;
  name: string;
  target_pct: number;
  flavor_index: number;
  created_at: string;
}

const COLUMNS = "id, user_id, name, target_pct, flavor_index, created_at";

function toDomain(row: GroupRow): AssetGroup {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    targetPct: Number(row.target_pct),
    flavorIndex: row.flavor_index,
    createdAt: row.created_at,
  };
}

export async function fetchGroups(supabase: SupabaseClient): Promise<AssetGroup[]> {
  const { data, error } = await supabase
    .from("asset_groups")
    .select(COLUMNS)
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
      flavor_index: group.flavorIndex,
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
  if (patch.flavorIndex !== undefined) update.flavor_index = patch.flavorIndex;

  const { error } = await supabase.from("asset_groups").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteGroup(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("asset_groups").delete().eq("id", id);
  if (error) throw error;
}
