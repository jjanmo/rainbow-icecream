import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAxisCategory,
  fetchAxisCategories,
  insertAxisCategory,
  updateAxisCategory,
} from "@/lib/api/axisCategories";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AxisCategoryType, NewAxisCategory } from "@/types/domain";

export const axisCategoriesQueryKey = ["axis-categories"] as const;

/** `axis`를 생략하면 역할·섹터 전부를 한 쿼리로 가져온다(캐시 하나 공유). */
export function useAxisCategories(axis?: AxisCategoryType) {
  const query = useQuery({
    queryKey: axisCategoriesQueryKey,
    queryFn: () => fetchAxisCategories(getSupabaseBrowserClient()),
  });
  return {
    ...query,
    data: axis ? query.data?.filter((c) => c.axis === axis) : query.data,
  };
}

function useInvalidateAxisCategories() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: axisCategoriesQueryKey });
}

export function useAddAxisCategory() {
  const invalidate = useInvalidateAxisCategories();
  return useMutation({
    mutationFn: (category: NewAxisCategory) => insertAxisCategory(getSupabaseBrowserClient(), category),
    onSuccess: invalidate,
  });
}

export function useUpdateAxisCategory() {
  const invalidate = useInvalidateAxisCategories();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<NewAxisCategory> }) =>
      updateAxisCategory(getSupabaseBrowserClient(), id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteAxisCategory() {
  const invalidate = useInvalidateAxisCategories();
  return useMutation({
    mutationFn: (id: string) => deleteAxisCategory(getSupabaseBrowserClient(), id),
    onSuccess: invalidate,
  });
}
