import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { NewHolding, Region } from '@/types/domain';
import type { AssetType, Market } from '@/types/journal';
import { ASSET_TYPES, ASSET_TYPE_LABELS, defaultMarketFor, marketsFor } from '@/lib/journal/marketMeta';

// qty/avgPrice are edited as free-form text (not `type="number"`) and only
// parsed to numbers on submit — a controlled number input whose value starts
// at 0 can't be typed into normally (e.g. typing "1" after "0" needs the "0"
// cleared first, which the browser gets in an inconsistent, cursor-dependent
// way, producing artifacts like "010").
type Draft = Omit<NewHolding, 'groupId' | 'qty' | 'avgPrice'>;

const EMPTY_DRAFT: Draft = {
  ticker: '',
  name: '',
  targetPctInGroup: 0,
  account: '일반계좌',
  region: '국내',
  market: 'KOSPI',
  assetType: 'STOCK',
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
    market: holding.market ?? defaultMarketFor(holding.region),
    assetType: holding.assetType,
    memo: holding.memo ?? '',
    sortOrder: holding.sortOrder,
  };
}

// Cash-like holdings (ticker: null) are stored as qty=1, avg_price=금액 — see
// resolveHoldingValueKrw, which values every holding as qty * price. Existing
// rows may have a different qty/avgPrice split that multiplies to the same
// total, so re-derive a single "금액" from that product rather than assuming
// qty was already 1.
function initialQtyText(holding: NewHolding | null | undefined): string {
  if (!holding) return '';
  return holding.ticker ? String(holding.qty) : '1';
}

function initialAmountText(holding: NewHolding | null | undefined): string {
  if (!holding) return '';
  return holding.ticker ? String(holding.avgPrice) : String(holding.qty * holding.avgPrice);
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
  onSubmit: (holding: NewHolding) => void;
}) {
  const isEdit = !!initialHolding;
  const [groupId, setGroupId] = useState(initialHolding?.groupId ?? defaultGroupId ?? '');
  const [draft, setDraft] = useState<Draft>(initialHolding ? toDraft(initialHolding) : EMPTY_DRAFT);
  const [qtyText, setQtyText] = useState(initialQtyText(initialHolding));
  const [avgPriceText, setAvgPriceText] = useState(initialAmountText(initialHolding));
  // Cash-like holding (e.g. 예적금/파킹통장 잔액): no ticker, qty is pinned to 1
  // and avgPriceText holds the 금액 itself (see initialAmountText above).
  const [isCash, setIsCash] = useState(!!initialHolding && !initialHolding.ticker);
  const [prevOpen, setPrevOpen] = useState(open);

  // Reset/prefill the form when the dialog transitions to open — adjusted
  // during render rather than in an effect, see https://react.dev/learn/you-might-not-need-an-effect
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setGroupId(initialHolding?.groupId ?? defaultGroupId ?? groupOptions[0]?.id ?? '');
      setDraft(initialHolding ? toDraft(initialHolding) : EMPTY_DRAFT);
      setQtyText(initialQtyText(initialHolding));
      setAvgPriceText(initialAmountText(initialHolding));
      setIsCash(!!initialHolding && !initialHolding.ticker);
    }
  }

  const qty = isCash ? 1 : parseFloat(qtyText) || 0;
  const avgPrice = parseFloat(avgPriceText) || 0;
  const avgPriceUnit = draft.region === '해외' ? 'USD' : 'KRW';
  const tickerLabel = draft.region === '국내' ? '코드' : '티커';

  function selectCashCurrency(region: Region, checked: boolean) {
    if (checked) {
      setIsCash(true);
      // 현금성 자산은 시세 조회도, 증권거래세도 대상이 아니다.
      setDraft((d) => ({ ...d, region, assetType: 'CASH', market: defaultMarketFor(region) }));
    } else {
      setIsCash(false);
    }
  }

  const canSubmit =
    !!groupId &&
    (isCash || (draft.ticker ?? '').trim().length > 0) &&
    draft.name.trim().length > 0 &&
    qty > 0 &&
    avgPrice > 0 &&
    (draft.account ?? '').trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ ...draft, groupId, qty, avgPrice, ticker: isCash ? null : draft.ticker });
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
                onValueChange={(v) =>
                  v &&
                  setDraft((d) => {
                    const region = v as Region;
                    // 시장은 구분에 종속된다 — 국내로 바꿨는데 NASDAQ이 남아있으면
                    // 증권거래세가 0으로 계산된다.
                    const market = marketsFor(region).includes(d.market as Market)
                      ? d.market
                      : defaultMarketFor(region);
                    return { ...d, region, market };
                  })
                }
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

          {/* 시장·자산유형은 증권거래세 계산에 필요하다 — 특히 국내 ETF는 매도 시
              면세라서 자산유형을 모르면 세금이 과다 계산된다 (ADR-0028). */}
          <div className="flex gap-2.5">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>시장</Label>
              <Select
                items={marketsFor(draft.region).map((m) => ({ label: m, value: m }))}
                value={draft.market ?? defaultMarketFor(draft.region)}
                onValueChange={(v) => v && setDraft((d) => ({ ...d, market: v as Market }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {marketsFor(draft.region).map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>자산유형</Label>
              <Select
                items={ASSET_TYPES.map((t) => ({ label: ASSET_TYPE_LABELS[t], value: t }))}
                value={draft.assetType}
                onValueChange={(v) => v && setDraft((d) => ({ ...d, assetType: v as AssetType }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ASSET_TYPE_LABELS[t]}
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

          {isCash ? (
            <div className="flex flex-col gap-1.5">
              <Label>
                금액 ({avgPriceUnit}) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                value={avgPriceText}
                onChange={(e) => setAvgPriceText(e.target.value)}
                className="font-mono"
              />
            </div>
          ) : (
            <div className="flex gap-2.5">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>
                  보유수량 <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={qtyText}
                  onChange={(e) => setQtyText(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>
                  평균매입가 ({avgPriceUnit}) <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={avgPriceText}
                  onChange={(e) => setAvgPriceText(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={isCash && draft.region === '국내'}
                onCheckedChange={(checked) => selectCashCurrency('국내', !!checked)}
              />
              KRW
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={isCash && draft.region === '해외'}
                onCheckedChange={(checked) => selectCashCurrency('해외', !!checked)}
              />
              $
            </label>
            <span className="text-xs text-muted-foreground">체크하면 코드 없이 종목명·금액만으로 등록</span>
          </div>

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
