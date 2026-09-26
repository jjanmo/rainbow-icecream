import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxisTarget } from "@/types/domain";

interface AxisTargetRow {
  axis: AxisTarget["axis"];
  bucket: string;
  target_pct: number;
}

export async function fetchAxisTargets(supabase: SupabaseClient): Promise<AxisTarget[]> {
  const { data, error } = await supabase.from("axis_targets").select("axis, bucket, target_pct");
  if (error) throw error;
  return (data as AxisTargetRow[]).map((r) => ({
    axis: r.axis,
    bucket: r.bucket,
    targetPct: Number(r.target_pct),
  }));
}

/**
 * 시장 축의 버킷별 목표를 통째로 교체한다 — `/portfolio`의 "완료"
 * 시점에만 호출된다(autosave 아님, ADR-0007). 0인 버킷은 행을 안 남긴다:
 * 먼저 그 축 행을 다 지우고(RLS로 자기 유저에 한정됨) 0보다 큰 것만 insert한다.
 * `user_id`는 컬럼 기본값 `auth.uid()`로 채워진다.
 */
export async function saveAxisTargets(
  supabase: SupabaseClient,
  axis: AxisTarget["axis"],
  targets: Record<string, number>,
): Promise<void> {
  const { error: deleteError } = await supabase.from("axis_targets").delete().eq("axis", axis);
  if (deleteError) throw deleteError;

  const rows = Object.entries(targets)
    .filter(([, pct]) => pct > 0)
    .map(([bucket, pct]) => ({ axis, bucket, target_pct: pct }));
  if (rows.length === 0) return;

  const { error: insertError } = await supabase.from("axis_targets").insert(rows);
  if (insertError) throw insertError;
}
