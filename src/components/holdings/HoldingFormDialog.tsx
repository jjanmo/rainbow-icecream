import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClassificationFieldsBlock } from '@/components/shared/ClassificationFields';
import { useAddAxisCategory, useAxisCategories } from '@/hooks/useAxisCategories';
import { deriveExposureRegion } from '@/lib/calc/axisRebalance';
import {
  ASSET_TYPE_LABELS,
  type AssetType,
  type ExposureRegion,
  type NewHolding,
  type Region,
} from '@/types/domain';

const EXPOSURE_ITEMS = [
  { label: '한국', value: '한국' },
  { label: '미국', value: '미국' },
  { label: '기타 (국가 무관)', value: '기타' },
];

// 추가 모달은 최초 진입 시 아무것도 선택되지 않은 placeholder 상태로 열려야 하므로,
// region/assetType도 (수정 모달과 달리) 빈 문자열을 잠깐 가질 수 있다 — 제출 시점엔
// canSubmit이 이미 실값 채움을 확인했으므로 안전하게 단언한다.
type Draft = Omit<NewHolding, 'qty' | 'avgPrice' | 'region' | 'assetType'> & {
  region: Region | '';
  assetType: AssetType | '';
};

const EMPTY_DRAFT: Draft = {
  ticker: '',
  name: '',
  account: '',
  region: '',
  assetType: '',
  exposureRegion: null,
  roleId: null,
  sectorId: null,
  leverage: 1,
};

const REGION_ITEMS = [
  { label: '국내', value: '국내' },
  { label: '해외', value: '해외' },
];

const ACCOUNT_TYPES = ['일반계좌', 'ISA', '연금저축', 'DC', 'IRP', '기타'];
const ACCOUNT_ITEMS = ACCOUNT_TYPES.map((v) => ({ label: v, value: v }));

const ASSET_TYPE_ITEMS = (Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((t) => ({
  label: ASSET_TYPE_LABELS[t],
  value: t,
}));

function toDraft(holding: NewHolding): Draft {
  return {
    ticker: holding.ticker ?? '',
    name: holding.name,
    account: holding.account ?? '',
    region: holding.region,
    assetType: holding.assetType,
    exposureRegion: holding.exposureRegion,
    roleId: holding.roleId,
    sectorId: holding.sectorId,
    leverage: holding.leverage,
  };
}

export function HoldingFormDialog({
  open,
  onOpenChange,
  initialHolding,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this holding instead of creating a new one. */
  initialHolding?: NewHolding | null;
  /** 수량·평균매입가는 여기서 받지 않는다 — 매매일지의 체결로만 바뀐다 (ADR-0044).
   * 새 종목은 항상 수량 0으로 만들어지고, 매매일지에서 첫 체결을 기록해야 채워진다.
   * 역할·섹터는 선택 입력 — 매매 시점에 채워도 된다 (ADR-0062). */
  onSubmit: (holding: Omit<NewHolding, 'qty' | 'avgPrice'>) => void;
}) {
  const isEdit = !!initialHolding;
  const [draft, setDraft] = useState<Draft>(initialHolding ? toDraft(initialHolding) : EMPTY_DRAFT);
  const [leverageText, setLeverageText] = useState(String((initialHolding ?? EMPTY_DRAFT).leverage));
  // 현금성 종목(ticker 없음)은 매매일지의 "+ 새 종목"에서만 만들 수 있다 — 여기서는
  // 기존 현금성 종목의 티커 입력만 계속 비활성화해 둔다(코드로 되돌릴 방법이 없다).
  const isCash = !!initialHolding && !initialHolding.ticker;
  const [prevOpen, setPrevOpen] = useState(open);
  const roleCategoriesQuery = useAxisCategories('role');
  const sectorCategoriesQuery = useAxisCategories('sector');
  const addAxisCategory = useAddAxisCategory();

  // Reset/prefill the form when the dialog transitions to open — adjusted
  // during render rather than in an effect, see https://react.dev/learn/you-might-not-need-an-effect
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const nextDraft = initialHolding ? toDraft(initialHolding) : EMPTY_DRAFT;
      setDraft(nextDraft);
      setLeverageText(String(nextDraft.leverage));
    }
  }

  const tickerLabel = draft.region === '' ? '코드/티커' : draft.region === '국내' ? '코드' : '티커';

  const canSubmit =
    !!draft.region &&
    !!draft.assetType &&
    (isCash || (draft.ticker ?? '').trim().length > 0) &&
    draft.name.trim().length > 0 &&
    (draft.account ?? '').trim().length > 0;

  async function handleCreateSector(name: string) {
    const sortOrder = sectorCategoriesQuery.data?.length ?? 0;
    return addAxisCategory.mutateAsync({ axis: 'sector', name, description: null, targetPct: 0, sortOrder });
  }

  function handleSubmit() {
    if (!canSubmit || !draft.region || !draft.assetType) return;
    onSubmit({
      ...draft,
      region: draft.region,
      assetType: draft.assetType,
      ticker: isCash ? null : draft.ticker,
      leverage: parseFloat(leverageText) || 1,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? '종목 수정' : '종목 추가'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>
              자산종류 <span className="text-destructive">*</span>
            </Label>
            <Select
              items={ASSET_TYPE_ITEMS}
              value={draft.assetType}
              onValueChange={(v) => v && setDraft((d) => ({ ...d, assetType: v as AssetType }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="자산종류 선택" />
              </SelectTrigger>
              <SelectContent>
                {ASSET_TYPE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2.5">
            <div className="flex w-24 flex-col gap-1.5">
              <Label>
                지역 <span className="text-destructive">*</span>
              </Label>
              <Select
                items={REGION_ITEMS}
                value={draft.region}
                onValueChange={(v) =>
                  v &&
                  setDraft((d) => ({
                    ...d,
                    region: v as Region,
                    // 상장 지역을 바꾸면 실질 지역 기본값도 다시 파생한다 — 이후
                    // 사용자가 "기타" 등으로 다시 덮어쓸 수 있다 (ADR-0058).
                    exposureRegion: deriveExposureRegion(v as Region),
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="지역 선택" />
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

          <div className="flex flex-col gap-1.5">
            <Label>
              실질 지역 <span className="text-destructive">*</span>
            </Label>
            <Select
              items={EXPOSURE_ITEMS}
              value={draft.region === '' ? '' : (draft.exposureRegion ?? '기타')}
              onValueChange={(v) =>
                v && setDraft((d) => ({ ...d, exposureRegion: v === '기타' ? null : (v as ExposureRegion) }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="지역을 먼저 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {EXPOSURE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              실제로 어느 시장에 노출되는지 — 예: 국내 상장 미국 ETF는 &ldquo;미국&rdquo;. 현금·채권·원자재는 &ldquo;기타&rdquo;.
            </p>
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

          <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-border p-2.5">
            <Label className="text-[11px] text-muted-foreground">
              역할·섹터·레버리지 (선택 — 매매 시점에도 지정할 수 있습니다)
            </Label>
            <ClassificationFieldsBlock
              roles={roleCategoriesQuery.data ?? []}
              roleId={draft.roleId}
              onRoleIdChange={(roleId) => setDraft((d) => ({ ...d, roleId }))}
              sectorId={draft.sectorId}
              onSectorIdChange={(sectorId) => setDraft((d) => ({ ...d, sectorId }))}
              sectors={sectorCategoriesQuery.data ?? []}
              onCreateSector={handleCreateSector}
              leverageText={leverageText}
              onLeverageTextChange={setLeverageText}
            />
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
