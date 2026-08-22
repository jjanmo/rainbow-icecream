import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { NewHolding, Region } from '@/types/domain';

type Draft = Omit<NewHolding, 'groupId' | 'qty' | 'avgPrice'>;

const EMPTY_DRAFT: Draft = {
  ticker: '',
  name: '',
  targetPctInGroup: 0,
  account: '일반계좌',
  region: '국내',
  memo: '',
  sortOrder: 0,
};

const REGION_ITEMS = [
  { label: '국내', value: '국내' },
  { label: '해외', value: '해외' },
];

const ACCOUNT_TYPES = ['일반계좌', 'ISA', '연금저축', 'IRP', 'CMA', '파킹통장', '예적금', '기타'];
const ACCOUNT_ITEMS = ACCOUNT_TYPES.map((v) => ({ label: v, value: v }));

function toDraft(holding: NewHolding): Draft {
  return {
    ticker: holding.ticker ?? '',
    name: holding.name,
    targetPctInGroup: holding.targetPctInGroup,
    account: holding.account ?? '',
    region: holding.region,
    memo: holding.memo ?? '',
    sortOrder: holding.sortOrder,
  };
}

export function HoldingFormDialog({
  open,
  onOpenChange,
  groupOptions,
  defaultGroupId,
  initialHolding,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupOptions: { id: string; name: string }[];
  defaultGroupId: string | null;
  /** When set, the dialog edits this holding instead of creating a new one. */
  initialHolding?: NewHolding | null;
  /** 수량·평균매입가는 여기서 받지 않는다 — 매매일지의 체결로만 바뀐다 (ADR-0044).
   * 새 종목은 항상 수량 0으로 만들어지고, 매매일지에서 첫 체결을 기록해야 채워진다. */
  onSubmit: (holding: Omit<NewHolding, 'qty' | 'avgPrice'>) => void;
}) {
  const isEdit = !!initialHolding;
  const [groupId, setGroupId] = useState(initialHolding?.groupId ?? defaultGroupId ?? '');
  const [draft, setDraft] = useState<Draft>(initialHolding ? toDraft(initialHolding) : EMPTY_DRAFT);
  // 현금성 종목(ticker 없음)은 매매일지의 "+ 새 종목"에서만 만들 수 있다 — 여기서는
  // 기존 현금성 종목의 티커 입력만 계속 비활성화해 둔다(코드로 되돌릴 방법이 없다).
  const isCash = !!initialHolding && !initialHolding.ticker;
  const [prevOpen, setPrevOpen] = useState(open);

  // Reset/prefill the form when the dialog transitions to open — adjusted
  // during render rather than in an effect, see https://react.dev/learn/you-might-not-need-an-effect
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setGroupId(initialHolding?.groupId ?? defaultGroupId ?? groupOptions[0]?.id ?? '');
      setDraft(initialHolding ? toDraft(initialHolding) : EMPTY_DRAFT);
    }
  }

  const tickerLabel = draft.region === '국내' ? '코드' : '티커';

  const canSubmit =
    !!groupId &&
    (isCash || (draft.ticker ?? '').trim().length > 0) &&
    draft.name.trim().length > 0 &&
    (draft.account ?? '').trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ ...draft, groupId, ticker: isCash ? null : draft.ticker });
    onOpenChange(false);
  }

  const groupItems = groupOptions.map((g) => ({ label: g.name, value: g.id }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? '종목 수정' : '종목 추가'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>
              자산군 <span className="text-destructive">*</span>
            </Label>
            <Select items={groupItems} value={groupId} onValueChange={(v) => setGroupId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="자산군 선택" />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2.5">
            <div className="flex w-24 flex-col gap-1.5">
              <Label>
                구분 <span className="text-destructive">*</span>
              </Label>
              <Select
                items={REGION_ITEMS}
                value={draft.region}
                onValueChange={(v) => v && setDraft((d) => ({ ...d, region: v as Region }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="국내">국내</SelectItem>
                  <SelectItem value="해외">해외</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>
                계좌 <span className="text-destructive">*</span>
              </Label>
              <Select
                items={ACCOUNT_ITEMS}
                value={draft.account ?? ''}
                onValueChange={(v) => v && setDraft((d) => ({ ...d, account: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="계좌 선택" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2.5">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>
                {tickerLabel} {!isCash && <span className="text-destructive">*</span>}
              </Label>
              <Input
                value={isCash ? '' : (draft.ticker ?? '')}
                onChange={(e) => setDraft((d) => ({ ...d, ticker: e.target.value }))}
                disabled={isCash}
                className="font-mono"
              />
            </div>
            <div className="flex flex-2 flex-col gap-1.5">
              <Label>
                종목명 <span className="text-destructive">*</span>
              </Label>
              <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </div>
          </div>

          {isCash && (
            <p className="text-xs text-muted-foreground">
              현금성 종목은 코드 없이 종목명·계좌만 고칠 수 있습니다. 금액은 매매일지에서 바꿉니다.
            </p>
          )}

          {!isEdit && (
            <p className="text-xs text-muted-foreground">
              여기서는 종목 정보만 등록됩니다 — 보유수량·평균매입가는 매매일지에서 첫 체결을 기록해야 채워집니다.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>비고</Label>
            <Input value={draft.memo ?? ''} onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isEdit ? '수정' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
