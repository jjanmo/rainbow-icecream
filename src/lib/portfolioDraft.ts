import type { HoldingPatch } from "@/lib/api/holdings";
import { UNGROUPED_KEY } from "@/lib/calc/rebalance";
import type {
  AssetGroup,
  AssetType,
  ExposureRegion,
  Holding,
  NewAssetGroup,
  NewHolding,
  Region,
} from "@/types/domain";

/**
 * Local, unsaved copy of a group/holding for /portfolio's edit mode. Editing
 * writes only to this shape — nothing touches Supabase until commitPortfolioDraft
 * runs (on "완료"). "취소" just discards it.
 */
export interface DraftGroup {
  clientKey: string;
  /** Real DB id, or null for a group created during this edit session. */
  id: string | null;
  name: string;
  targetPct: number;
  /** Manual display order, set via drag-and-drop — also drives this group's
   * derived color (see lib/calc/color.ts hueForGroupIndex). */
  sortOrder: number;
}

export interface DraftHolding {
  clientKey: string;
  id: string | null;
  /** References a DraftGroup.clientKey, not a real group id — the group
   * itself may also be new and not have a real id yet. `UNGROUPED_KEY`면
   * 어느 자산군에도 안 속한 상태(커밋 시 group_id = null, ADR-0059). */
  groupClientKey: string;
  ticker: string | null;
  name: string;
  targetPctInGroup: number;
  qty: number;
  avgPrice: number;
  account: string | null;
  region: Region;
  assetType: AssetType;
  /** /portfolio 편집 모드에선 안 고치지만, 커밋 때 안 떨어뜨리려고 실어 나른다 (ADR-0058). */
  exposureRegion: ExposureRegion | null;
  sortOrder: number;
}

export function toDraftGroup(g: AssetGroup): DraftGroup {
  return { clientKey: g.id, id: g.id, name: g.name, targetPct: g.targetPct, sortOrder: g.sortOrder };
}

// active-only fetchHoldings() 결과지만 h.groupId가 null일 수 있다 — 자산군이
// 삭제된 미지정 종목(ADR-0059). 그 경우 UNGROUPED_KEY로 표시한다.
export function toDraftHolding(h: Holding): DraftHolding {
  return {
    clientKey: h.id,
    id: h.id,
    groupClientKey: h.groupId ?? UNGROUPED_KEY,
    ticker: h.ticker,
    name: h.name,
    targetPctInGroup: h.targetPctInGroup,
    qty: h.qty,
    avgPrice: h.avgPrice,
    account: h.account,
    region: h.region,
    assetType: h.assetType,
    exposureRegion: h.exposureRegion,
    sortOrder: h.sortOrder,
  };
}

export function newDraftGroup(sortOrder: number): DraftGroup {
  return { clientKey: crypto.randomUUID(), id: null, name: "새 자산군", targetPct: 0, sortOrder };
}

/**
 * Reassigns sortOrder (0, 1, 2, ...) for one group's holdings after a
 * drag-and-drop reorder — `orderedClientKeys` is that group's holdings in
 * their new order. Holdings in other groups are returned unchanged.
 */
export function reorderDraftHoldings(
  holdings: DraftHolding[],
  orderedClientKeys: string[],
): DraftHolding[] {
  const orderByClientKey = new Map(orderedClientKeys.map((key, index) => [key, index]));
  return holdings.map((h) => {
    const sortOrder = orderByClientKey.get(h.clientKey);
    return sortOrder === undefined ? h : { ...h, sortOrder };
  });
}

/**
 * Moves one holding into a different group during a cross-group drag
 * (ADR-0036), placing it at the end of the target group's list. Used for the
 * live preview while dragging over another group — `/portfolio`'s drag-end
 * handler follows up with `reorderDraftHoldings` for precise final position.
 */
export function moveDraftHoldingToGroup(
  holdings: DraftHolding[],
  clientKey: string,
  targetGroupClientKey: string,
): DraftHolding[] {
  const maxSortOrder = holdings
    .filter((h) => h.groupClientKey === targetGroupClientKey)
    .reduce((max, h) => Math.max(max, h.sortOrder), -1);
  return holdings.map((h) =>
    h.clientKey === clientKey ? { ...h, groupClientKey: targetGroupClientKey, sortOrder: maxSortOrder + 1 } : h,
  );
}

/** Reassigns sortOrder (0, 1, 2, ...) for all draft groups after a
 * drag-and-drop reorder — `orderedClientKeys` is every group's clientKey in
 * its new order. */
export function reorderDraftGroups(groups: DraftGroup[], orderedClientKeys: string[]): DraftGroup[] {
  const orderByClientKey = new Map(orderedClientKeys.map((key, index) => [key, index]));
  return groups.map((g) => {
    const sortOrder = orderByClientKey.get(g.clientKey);
    return sortOrder === undefined ? g : { ...g, sortOrder };
  });
}

export interface PortfolioDraftMutations {
  addGroup: (group: NewAssetGroup) => Promise<AssetGroup>;
  updateGroup: (input: { id: string; patch: Partial<NewAssetGroup> }) => Promise<unknown>;
  deleteGroup: (id: string) => Promise<unknown>;
  addHolding: (holding: NewHolding) => Promise<Holding>;
  updateHolding: (input: { id: string; patch: HoldingPatch }) => Promise<unknown>;
  deleteHolding: (id: string) => Promise<unknown>;
}

/**
 * Diffs draft vs. original and replays only what changed to Supabase, in
 * dependency order (deletes, then new groups so their real ids exist before
 * new holdings reference them, then updates). Runs sequentially — Supabase
 * has no client-reachable cross-table transaction, so a mid-way failure can
 * leave some changes applied; callers should keep the draft around on error
 * so the user can retry rather than lose their edits.
 */
export async function commitPortfolioDraft({
  originalGroups,
  originalHoldings,
  draftGroups,
  draftHoldings,
  mutations,
}: {
  originalGroups: AssetGroup[];
  originalHoldings: Holding[];
  draftGroups: DraftGroup[];
  draftHoldings: DraftHolding[];
  mutations: PortfolioDraftMutations;
}): Promise<void> {
  const draftGroupIds = new Set(draftGroups.filter((g): g is DraftGroup & { id: string } => g.id !== null).map((g) => g.id));
  const draftHoldingIds = new Set(
    draftHoldings.filter((h): h is DraftHolding & { id: string } => h.id !== null).map((h) => h.id),
  );

  // 1. Deleted groups (cascades to their holdings in the DB).
  const deletedGroupIds = new Set(originalGroups.filter((g) => !draftGroupIds.has(g.id)).map((g) => g.id));
  for (const id of deletedGroupIds) {
    await mutations.deleteGroup(id);
  }

  // 2. Deleted holdings — draft에서 사라진 것들. 자산군 삭제로 group_id가 null이
  //    된 종목은 draft에 계속 남아있으므로(미지정 목록) 여기 안 걸린다.
  const deletedHoldings = originalHoldings.filter(
    (h) => !draftHoldingIds.has(h.id) && !(h.groupId !== null && deletedGroupIds.has(h.groupId)),
  );
  for (const h of deletedHoldings) {
    await mutations.deleteHolding(h.id);
  }

  // 3. New groups — record real ids as they're created.
  const clientKeyToGroupId = new Map<string, string>();
  for (const g of draftGroups) {
    if (g.id === null) {
      const created = await mutations.addGroup({ name: g.name, targetPct: g.targetPct, sortOrder: g.sortOrder });
      clientKeyToGroupId.set(g.clientKey, created.id);
    } else {
      clientKeyToGroupId.set(g.clientKey, g.id);
    }
  }

  // 4. Updated existing groups.
  const originalGroupById = new Map(originalGroups.map((g) => [g.id, g]));
  for (const g of draftGroups) {
    if (g.id === null) continue;
    const original = originalGroupById.get(g.id);
    if (!original) continue;
    const patch: Partial<NewAssetGroup> = {};
    if (original.name !== g.name) patch.name = g.name;
    if (original.targetPct !== g.targetPct) patch.targetPct = g.targetPct;
    if (original.sortOrder !== g.sortOrder) patch.sortOrder = g.sortOrder;
    if (Object.keys(patch).length > 0) {
      await mutations.updateGroup({ id: g.id, patch });
    }
  }

  // 5. New holdings — resolve their (possibly newly-created) group's real id.
  for (const h of draftHoldings) {
    if (h.id !== null) continue;
    const groupId = clientKeyToGroupId.get(h.groupClientKey);
    if (!groupId) continue; // parent group failed to create — skip rather than throw away the whole batch
    await mutations.addHolding({
      groupId,
      ticker: h.ticker,
      name: h.name,
      targetPctInGroup: h.targetPctInGroup,
      qty: h.qty,
      avgPrice: h.avgPrice,
      account: h.account,
      region: h.region,
      assetType: h.assetType,
      exposureRegion: h.exposureRegion,
      sortOrder: h.sortOrder,
    });
  }

  // 6. Updated existing holdings.
  const originalHoldingById = new Map(originalHoldings.map((h) => [h.id, h]));
  for (const h of draftHoldings) {
    if (h.id === null) continue;
    const original = originalHoldingById.get(h.id);
    if (!original) continue;
    const resolvedGroupId =
      h.groupClientKey === UNGROUPED_KEY ? null : (clientKeyToGroupId.get(h.groupClientKey) ?? h.groupClientKey);
    const patch: HoldingPatch = {};
    if (original.groupId !== resolvedGroupId) patch.groupId = resolvedGroupId;
    if (original.ticker !== h.ticker) patch.ticker = h.ticker;
    if (original.name !== h.name) patch.name = h.name;
    if (original.targetPctInGroup !== h.targetPctInGroup) patch.targetPctInGroup = h.targetPctInGroup;
    if (original.qty !== h.qty) patch.qty = h.qty;
    if (original.avgPrice !== h.avgPrice) patch.avgPrice = h.avgPrice;
    if (original.account !== h.account) patch.account = h.account;
    if (original.region !== h.region) patch.region = h.region;
    if (original.assetType !== h.assetType) patch.assetType = h.assetType;
    if (original.exposureRegion !== h.exposureRegion) patch.exposureRegion = h.exposureRegion;
    if (original.sortOrder !== h.sortOrder) patch.sortOrder = h.sortOrder;
    if (Object.keys(patch).length > 0) {
      await mutations.updateHolding({ id: h.id, patch });
    }
  }
}
