import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxisCategory, AxisCategoryType, NewAxisCategory } from "@/types/domain";

interface AxisCategoryRow {
  id: string;
  user_id: string;
  axis: AxisCategoryType;
  name: string;
  description: string | null;
  target_pct: number;
  sort_order: number;
  created_at: string;
}

const COLUMNS = "id, user_id, axis, name, description, target_pct, sort_order, created_at";

function toDomain(row: AxisCategoryRow): AxisCategory {
  return {
    id: row.id,
    userId: row.user_id,
    axis: row.axis,
    name: row.name,
    description: row.description,
    targetPct: Number(row.target_pct),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

/** `axis`를 생략하면 역할·섹터 전부(유저의 모든 축 카테고리)를 가져온다. */
export async function fetchAxisCategories(
  supabase: SupabaseClient,
  axis?: AxisCategoryType,
): Promise<AxisCategory[]> {
  let query = supabase.from("axis_categories").select(COLUMNS);
  if (axis) query = query.eq("axis", axis);
  const { data, error } = await query.order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw error;
  return (data as AxisCategoryRow[]).map(toDomain);
}

export async function insertAxisCategory(
  supabase: SupabaseClient,
  category: NewAxisCategory,
): Promise<AxisCategory> {
  const { data, error } = await supabase
    .from("axis_categories")
    .insert({
      axis: category.axis,
      name: category.name,
      description: category.description,
      target_pct: category.targetPct,
      sort_order: category.sortOrder,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toDomain(data as AxisCategoryRow);
}

export async function updateAxisCategory(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<NewAxisCategory>,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.targetPct !== undefined) update.target_pct = patch.targetPct;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  const { error } = await supabase.from("axis_categories").update(update).eq("id", id);
  if (error) throw error;
}

/** 이 카테고리를 가리키던 종목은 FK의 `on delete set null`로 자동 미분류/미지정이 된다. */
export async function deleteAxisCategory(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("axis_categories").delete().eq("id", id);
  if (error) throw error;
}
