import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  parseTradePlanDraft,
  toTradePlanDraft,
  TradePlanFieldsBlock,
  type TradePlanDraft,
} from '@/components/shared/TradePlanFields';
import { fmtMaxBuyPlan, fmtPlanAmount } from '@/lib/calc/tradePlan';
import type { Holding, TradePlan } from '@/types/domain';


/** 매매일지 종목 모드의 "매매 계획" 칸 (ADR-0064). 계획은 holding row 단위라, 같은 종목이
 * 계좌별로 여러 row로 나뉘어 있으면(종목 모드는 계좌를 무시하고 묶는다) row마다 하나씩
 * 보여준다. 전량 매도로 삭제된 row의 계획은 더 이상 쓸 일이 없어 보여주지 않고, 전부
 * 삭제된 종목이면 가장 최근 row의 계획을 읽기 전용으로만 보여준다. */
export function TradePlanCard({
  holdings,
  onSave,
}: {
  /** 같은 종목(티커+지역)으로 묶인 holding row 전부 — 삭제된 것 포함. */
  holdings: Holding[];
  onSave: (holdingId: string, plan: TradePlan) => Promise<void>;
}) {
  const active = holdings.filter((h) => !h.deletedAt);
  const latestDeleted = [...holdings].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const items = active.length > 0 ? active : latestDeleted ? [latestDeleted] : [];

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 text-[13px] font-semibold">매매 계획</div>
      <div className="flex flex-col gap-3">
        {items.map((h) => (
          <TradePlanItem
            key={h.id}
            holding={h}
            // 계좌가 여러 개일 때만 어느 계좌의 계획인지 표시한다.
            accountLabel={items.length > 1 ? (h.account ?? '계좌 미지정') : null}
            readOnly={!!h.deletedAt}
            onSave={(plan) => onSave(h.id, plan)}
          />
        ))}
      </div>
    </div>
  );
}

function TradePlanItem({
  holding,
  accountLabel,
  readOnly,
  onSave,
}: {
  holding: Holding;
  accountLabel: string | null;
  readOnly: boolean;
  onSave: (plan: TradePlan) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TradePlanDraft>(() => toTradePlanDraft(holding));
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setDraft(toTradePlanDraft(holding));
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(parseTradePlanDraft(draft));
      setEditing(false);
    } catch {
      // 실패 토스트는 onSave 쪽에서 띄운다 — 편집 상태를 유지해 입력한 내용을 잃지 않게 한다.
    } finally {
      setSaving(false);
    }
  }

  const maxBuy = fmtMaxBuyPlan(holding);

  return (
    <div className="border-t border-border pt-3 text-xs first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {accountLabel}
          {readOnly && '전량 매도된 종목 — 마지막 계획'}
        </span>
        {!readOnly && !editing && (
          <button
            type="button"
            onClick={startEditing}
            className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            수정
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2.5">
          <TradePlanFieldsBlock draft={draft} onChange={setDraft} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              취소
            </button>
            <Button type="button" size="sm" className="h-6 text-[11px]" onClick={() => void handleSave()} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-3 gap-2">
          <PlanValue label="정찰병" value={holding.scoutAmount != null ? fmtPlanAmount(holding.scoutAmount) : null} />
          <PlanValue label="최대매수/분할" value={maxBuy} />
          <PlanValue label="손절라인" value={holding.stopLossPct != null ? `${holding.stopLossPct}%` : null} />
          {holding.maxUndecided && holding.undecidedMemo && (
            <div className="col-span-3 flex flex-col gap-0.5">
              <dt className="text-[10px] text-muted-foreground">매수 전략 메모</dt>
              <dd className="whitespace-pre-wrap">{holding.undecidedMemo}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

function PlanValue({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className={value ? 'font-mono font-semibold' : 'text-muted-foreground'}>{value ?? '미정'}</dd>
    </div>
  );
}
