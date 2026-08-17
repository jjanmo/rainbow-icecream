import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TagInput } from '@/components/journal/TagInput';
import { cn } from '@/lib/utils';
import { computeExecutionAmount, currencyOf, normalizeQty } from '@/lib/journal/cost';
import { fmtQty, fmtUsd, fmtWon } from '@/lib/format';
import type { Holding, NewHolding, Region } from '@/types/domain';
import {
  BUY_INTENTS,
  EMOTION_TAGS,
  EXIT_REASON_LABELS,
  INTENT_LABELS,
  SELL_INTENTS,
  type Execution,
  type ExecutionIntent,
  type ExitReason,
  type NewExecution,
  type NoteTargetType,
  type Side,
  type TradeNote,
} from '@/types/journal';

/** ExecutionFormDialog가 만드는 근거 초안. targetKey는 아직 모른다(신규 체결의
 * id·종목 id가 저장 후에야 확정) — journal.tsx가 채운다. */
export interface ExecutionNoteDraft {
  targetType: NoteTargetType;
  setupTags: string[];
  emotionTags: string[];
  exitReason: ExitReason | null;
  followedPlan: boolean | null;
  invalidationCondition: string | null;
  stopPrice: number | null;
  targetPrice: number | null;
  body: string | null;
}

const ACCOUNT_TYPES = ['일반계좌', 'ISA', '연금저축', 'IRP', 'CMA', '파킹통장', '예적금', '기타'];

/** `datetime-local` 값(로컬 시간, 초 없음) ↔ ISO8601(UTC) 변환. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface NewHoldingDraft {
  groupId: string;
  ticker: string;
  name: string;
  region: Region;
  account: string;
}

export interface ExecutionSubmit {
  /** 기존 종목에 붙이는 체결. */
  holding?: Holding;
  /** 새 종목을 먼저 만들어야 하는 체결 — 수량 0 으로 만들고 이 체결이 채운다. */
  newHolding?: NewHolding;
  execution: Omit<NewExecution, 'holdingId'>;
  /** 근거 섹션에 뭔가 입력했을 때만 채워진다 — 빈 노트 행은 만들지 않는다. */
  note?: ExecutionNoteDraft;
}

/**
 * 매매 추가. 필수 입력을 6개(종목·구분·수량·단가·체결일시 + 계좌는 종목에 종속)
 * 이하로 유지한다 — 근거 섹션은 기본 접힘 상태의 선택 입력이라, 채우지 않아도
 * 저장할 수 있다. 입력 마찰이 커지면 기록 자체를 안 하게 된다.
 *
 * 수수료·증권거래세는 계산하지 않는다 — 증권사·이벤트 할인율마다 달라 정밀
 * 계산의 실익이 낮다고 판단해 뺐다 (ADR-0034).
 *
 * 환율도 입력받지 않는다 — 해외 종목은 항상 달러 기준으로만 기록·표시하고
 * 원화로 환산하지 않는다 (ADR-0038).
 */
export function ExecutionFormDialog({
  open,
  onOpenChange,
  holdings,
  groupOptions,
  tradeNotes,
  setupTagSuggestions,
  onSubmit,
  editingExecution,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holdings: Holding[];
  groupOptions: { id: string; name: string }[];
  /** 매도 화면 상단에 그 종목의 POSITION 노트(매수 근거·청산조건)를 띄우기 위해 필요하다. */
  tradeNotes: TradeNote[];
  /** 셋업 태그 자동완성 후보 — 기존에 쓰인 태그 전체. */
  setupTagSuggestions: string[];
  onSubmit: (submit: ExecutionSubmit) => void;
  /** 지정하면 새 체결 추가가 아니라 이 체결을 고치는 모드로 연다 — 종목은 바꿀
   * 수 없고(다른 종목으로 옮기는 건 별도 리플레이 대상이 둘이 되는 문제라 지원하지
   * 않는다), 근거 섹션도 이 모드에서는 숨긴다(근거는 별도 편집 경로가 없다). */
  editingExecution?: Execution | null;
  onUpdate?: (input: { id: string; patch: Omit<NewExecution, 'holdingId'> }) => void;
}) {
  const [side, setSide] = useState<Side>('BUY');
  const [holdingId, setHoldingId] = useState('');
  const [isNewHolding, setIsNewHolding] = useState(false);
  const [intent, setIntent] = useState<ExecutionIntent>('NEW');
  const [qtyText, setQtyText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [executedAtLocal, setExecutedAtLocal] = useState('');
  const [newHolding, setNewHolding] = useState<NewHoldingDraft>({
    groupId: '',
    ticker: '',
    name: '',
    region: '국내',
    account: '일반계좌',
  });
  const [noteOpen, setNoteOpen] = useState(false);
  // 매수 전용 — POSITION 노트.
  const [setupTags, setSetupTags] = useState<string[]>([]);
  const [invalidationCondition, setInvalidationCondition] = useState('');
  const [stopPriceText, setStopPriceText] = useState('');
  const [targetPriceText, setTargetPriceText] = useState('');
  // 매도 전용 — EXECUTION 노트.
  const [emotionTags, setEmotionTags] = useState<string[]>([]);
  const [exitReason, setExitReason] = useState<ExitReason | null>(null);
  const [followedPlan, setFollowedPlan] = useState<boolean | null>(null);
  // 공통.
  const [noteBody, setNoteBody] = useState('');
  const [prevOpen, setPrevOpen] = useState(open);

  // 열릴 때 초기화 — effect 가 아니라 렌더 중 조정한다 (프로젝트 컨벤션).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && editingExecution) {
      setSide(editingExecution.side);
      setIntent(editingExecution.intent);
      setHoldingId(editingExecution.holdingId);
      setIsNewHolding(false);
      setQtyText(String(editingExecution.qty));
      setPriceText(String(editingExecution.price));
      setExecutedAtLocal(toLocalInputValue(editingExecution.executedAt));
      setNoteOpen(false);
    } else if (open) {
      setSide('BUY');
      setIntent('NEW');
      setHoldingId(holdings[0]?.id ?? '');
      setIsNewHolding(holdings.length === 0);
      setQtyText('');
      setPriceText('');
      setExecutedAtLocal(toLocalInputValue(new Date().toISOString()));
      setNewHolding({
        groupId: groupOptions[0]?.id ?? '',
        ticker: '',
        name: '',
        region: '국내',
        account: '일반계좌',
      });
      setNoteOpen(false);
      setSetupTags([]);
      setInvalidationCondition('');
      setStopPriceText('');
      setTargetPriceText('');
      setEmotionTags([]);
      setExitReason(null);
      setFollowedPlan(null);
      setNoteBody('');
    }
  }

  const selected = holdings.find((h) => h.id === holdingId);
  // 매도 화면 상단 배너용 — 그 종목을 살 때 남긴 근거·청산조건.
  const positionNote =
    !isNewHolding && selected
      ? tradeNotes.find((n) => n.targetType === 'POSITION' && n.targetKey === selected.id)
      : undefined;
  const region: Region = isNewHolding ? newHolding.region : (selected?.region ?? '국내');
  const currency = currencyOf(region);

  const qty = normalizeQty(parseFloat(qtyText) || 0);
  const price = parseFloat(priceText) || 0;
  const executedAt = executedAtLocal ? new Date(executedAtLocal).toISOString() : '';

  const amount = qty > 0 && price > 0 ? computeExecutionAmount({ side, qty, price, region }) : null;

  // 매도는 보유 수량을 넘을 수 없다 — 저장 후 리플레이에서 거부되므로 여기서 먼저 막는다.
  // 수정 모드는 서버 쪽 리플레이가 최종 판단을 하므로 여기서 미리 막지 않는다
  // (기존 체결 하나를 고치는 거라 "지금 보유 수량"과 단순 비교가 맞지 않는다).
  const available = selected?.qty ?? 0;
  const oversold = !editingExecution && side === 'SELL' && !isNewHolding && qty > available;

  // 새 종목의 첫 매수는 정의상 항상 신규진입이라 고를 것이 없다 — 반대로 이미
  // 보유 중인 종목에 매수를 추가하는 거라면 "신규진입"은 선택지에서 뺀다. 다만
  // 이미 신규진입으로 기록된 체결을 수정하는 중이면 그 선택지를 계속 보여준다.
  const isForcedNewIntent = side === 'BUY' && isNewHolding;
  const allowNewIntent = isForcedNewIntent || editingExecution?.intent === 'NEW';
  const intentOptions =
    side === 'BUY' ? (allowNewIntent ? BUY_INTENTS : BUY_INTENTS.filter((o) => o !== 'NEW')) : SELL_INTENTS;
  const resolvedIntent = isForcedNewIntent ? 'NEW' : intentOptions.includes(intent) ? intent : intentOptions[0];

  const canSubmit =
    qty > 0 &&
    price > 0 &&
    !!executedAt &&
    !oversold &&
    (isNewHolding
      ? !!newHolding.groupId && newHolding.name.trim().length > 0 && side === 'BUY'
      : !!selected);

  // 근거 섹션에 뭔가 입력했을 때만 채운다 — 빈 노트 행을 만들지 않는다.
  function buildNoteDraft(): ExecutionNoteDraft | undefined {
    const trimmedInvalidation = invalidationCondition.trim();
    const trimmedBody = noteBody.trim();
    const stopPrice = parseFloat(stopPriceText) || null;
    const targetPrice = parseFloat(targetPriceText) || null;

    if (side === 'BUY') {
      const hasContent =
        setupTags.length > 0 || !!trimmedInvalidation || stopPrice != null || targetPrice != null || !!trimmedBody;
      if (!hasContent) return undefined;
      return {
        targetType: 'POSITION',
        setupTags,
        emotionTags: [],
        exitReason: null,
        followedPlan: null,
        invalidationCondition: trimmedInvalidation || null,
        stopPrice,
        targetPrice,
        body: trimmedBody || null,
      };
    }

    const hasContent = emotionTags.length > 0 || exitReason !== null || followedPlan !== null || !!trimmedBody;
    if (!hasContent) return undefined;
    return {
      targetType: 'EXECUTION',
      setupTags: [],
      emotionTags,
      exitReason,
      followedPlan,
      invalidationCondition: null,
      stopPrice: null,
      targetPrice: null,
      body: trimmedBody || null,
    };
  }

  function handleSubmit() {
    if (!canSubmit || !amount) return;
    const execution: Omit<NewExecution, 'holdingId'> = {
      side,
      intent: resolvedIntent,
      executedAt,
      qty,
      price,
    };
    if (editingExecution) {
      onUpdate?.({ id: editingExecution.id, patch: execution });
      onOpenChange(false);
      return;
    }
    const note = buildNoteDraft();
    if (isNewHolding) {
      onSubmit({
        newHolding: {
          groupId: newHolding.groupId,
          ticker: newHolding.ticker.trim() || null,
          name: newHolding.name.trim(),
          targetPctInGroup: 0,
          // 새 종목은 수량 0 으로 만들고 이 체결이 채운다 — 기초잔고가 아니다.
          qty: 0,
          avgPrice: 0,
          account: newHolding.account,
          region: newHolding.region,
          memo: null,
          sortOrder: 0,
        },
        execution,
        note,
      });
    } else {
      onSubmit({ holding: selected, execution, note });
    }
    onOpenChange(false);
  }

  const holdingItems = holdings.map((h) => ({
    label: `${h.name}${h.ticker ? ` (${h.ticker})` : ''} · ${h.account ?? '-'}`,
    value: h.id,
  }));
  const fmtNative = (n: number) => (currency === 'USD' ? fmtUsd(n) : fmtWon(n));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingExecution ? '매매 수정' : '매매 추가'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {(['BUY', 'SELL'] as Side[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSide(s);
                  setIntent(s === 'BUY' ? 'NEW' : 'SCALE_OUT');
                  if (s === 'SELL') setIsNewHolding(false);
                }}
                className={cn(
                  'rounded-lg border py-2 text-sm font-semibold transition-colors',
                  side === s
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {s === 'BUY' ? '매수' : '매도'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>
                종목 <span className="text-destructive">*</span>
              </Label>
              {side === 'BUY' && !editingExecution && (
                <button
                  type="button"
                  onClick={() => setIsNewHolding((v) => !v)}
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  {isNewHolding ? '기존 종목에서 고르기' : '+ 새 종목'}
                </button>
              )}
            </div>
            {isNewHolding ? (
              <div className="flex flex-col gap-2.5 rounded-lg border border-dashed border-border p-2.5">
                <div className="flex gap-2.5">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label className="text-[11px]">자산군</Label>
                    <Select
                      items={groupOptions.map((g) => ({ label: g.name, value: g.id }))}
                      value={newHolding.groupId}
                      onValueChange={(v) => v && setNewHolding((d) => ({ ...d, groupId: v }))}
                    >
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue placeholder="선택" />
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
                  <div className="flex w-20 flex-col gap-1.5">
                    <Label className="text-[11px]">구분</Label>
                    <Select
                      items={[
                        { label: '국내', value: '국내' },
                        { label: '해외', value: '해외' },
                      ]}
                      value={newHolding.region}
                      onValueChange={(v) => v && setNewHolding((d) => ({ ...d, region: v as Region }))}
                    >
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="국내">국내</SelectItem>
                        <SelectItem value="해외">해외</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex w-24 flex-col gap-1.5">
                    <Label className="text-[11px]">{newHolding.region === '국내' ? '코드' : '티커'}</Label>
                    <Input
                      value={newHolding.ticker}
                      onChange={(e) => setNewHolding((d) => ({ ...d, ticker: e.target.value }))}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label className="text-[11px]">
                      종목명 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={newHolding.name}
                      onChange={(e) => setNewHolding((d) => ({ ...d, name: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label className="text-[11px]">계좌</Label>
                    <Select
                      items={ACCOUNT_TYPES.map((v) => ({ label: v, value: v }))}
                      value={newHolding.account}
                      onValueChange={(v) => v && setNewHolding((d) => ({ ...d, account: v }))}
                    >
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ) : (
              <Select
                items={holdingItems}
                value={holdingId}
                onValueChange={(v) => setHoldingId(v ?? '')}
                disabled={!!editingExecution}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="종목 선택" />
                </SelectTrigger>
                <SelectContent>
                  {holdings.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                      {h.ticker ? ` (${h.ticker})` : ''} · {h.account ?? '-'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {side === 'SELL' && selected && (
              <span className="text-[11px] text-muted-foreground">
                보유 {fmtQty(available)} · 평단 {fmtNative(selected.avgPrice)}
              </span>
            )}
          </div>

          {/* 그 종목을 살 때 남긴 근거·청산조건 — "감정적 이탈"을 스스로 기록하게 만드는 장치. */}
          {side === 'SELL' && selected && (
            <div className="rounded-lg border border-dashed border-border p-2.5 text-xs">
              {positionNote ? (
                <div className="flex flex-col gap-1.5">
                  <div className="font-semibold text-muted-foreground">매수 근거</div>
                  {positionNote.setupTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {positionNote.setupTags.map((tag) => (
                        <span key={tag} className="rounded-full border border-border bg-muted px-2 py-0.5">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {positionNote.invalidationCondition && (
                    <Row label="청산조건" value={positionNote.invalidationCondition} />
                  )}
                  {positionNote.stopPrice != null && <Row label="손절가" value={fmtNative(positionNote.stopPrice)} />}
                  {positionNote.targetPrice != null && (
                    <Row label="목표가" value={fmtNative(positionNote.targetPrice)} />
                  )}
                  {positionNote.body && <p className="text-muted-foreground">{positionNote.body}</p>}
                </div>
              ) : (
                <span className="text-muted-foreground">매수 시 기록된 근거가 없습니다.</span>
              )}
            </div>
          )}

          <div className="flex gap-2.5">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>
                수량 <span className="text-destructive">*</span>
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>
                단가 ({currency}) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              체결일시 <span className="text-destructive">*</span>
            </Label>
            <Input
              type="datetime-local"
              value={executedAtLocal}
              onChange={(e) => setExecutedAtLocal(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>매매 의도</Label>
            {isForcedNewIntent ? (
              <span className="text-xs text-muted-foreground">
                신규진입 — 새 종목의 첫 매수라 고를 필요 없이 항상 신규진입입니다.
              </span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {intentOptions.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setIntent(o)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      resolvedIntent === o
                        ? 'border-primary bg-accent text-accent-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {INTENT_LABELS[o]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 기본 접힘 — 채우지 않아도 저장할 수 있다. 채워두면 매수는 POSITION
              노트(청산조건이 매도 화면 배너로 뜬다), 매도는 EXECUTION 노트로 저장된다.
              수정 모드에서는 숨긴다 — 근거는 이 다이얼로그에 별도 편집 경로가 없다. */}
          {!editingExecution && (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setNoteOpen((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn('size-3.5 transition-transform', noteOpen && 'rotate-180')} />
              근거 추가{!noteOpen && ' (선택)'}
            </button>

            {noteOpen && (
              <div className="flex flex-col gap-2.5 rounded-lg border border-dashed border-border p-2.5">
                {side === 'BUY' ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[11px]">셋업 태그</Label>
                      <TagInput
                        value={setupTags}
                        onChange={setSetupTags}
                        suggestions={setupTagSuggestions}
                        placeholder="예: 모멘텀, 실적서프라이즈"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[11px]">청산조건 (매매 근거가 깨지는 조건)</Label>
                      <Input
                        value={invalidationCondition}
                        onChange={(e) => setInvalidationCondition(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex gap-2.5">
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Label className="text-[11px]">손절가 ({currency})</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={stopPriceText}
                          onChange={(e) => setStopPriceText(e.target.value)}
                          className="h-8 font-mono text-xs"
                        />
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Label className="text-[11px]">목표가 ({currency})</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={targetPriceText}
                          onChange={(e) => setTargetPriceText(e.target.value)}
                          className="h-8 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[11px]">감정</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {EMOTION_TAGS.map((tag) => {
                          const active = emotionTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() =>
                                setEmotionTags((tags) =>
                                  active ? tags.filter((t) => t !== tag) : [...tags, tag],
                                )
                              }
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                                active
                                  ? 'border-primary bg-accent text-accent-foreground'
                                  : 'border-border text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[11px]">매도사유</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(EXIT_REASON_LABELS) as ExitReason[]).map((reason) => (
                          <button
                            key={reason}
                            type="button"
                            onClick={() => setExitReason((r) => (r === reason ? null : reason))}
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-xs transition-colors',
                              exitReason === reason
                                ? 'border-primary bg-accent text-accent-foreground'
                                : 'border-border text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {EXIT_REASON_LABELS[reason]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[11px]">계획대로 했나요?</Label>
                      <div className="flex gap-1.5">
                        {([
                          { label: '예', v: true },
                          { label: '아니오', v: false },
                        ] as const).map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => setFollowedPlan((cur) => (cur === opt.v ? null : opt.v))}
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-xs transition-colors',
                              followedPlan === opt.v
                                ? 'border-primary bg-accent text-accent-foreground'
                                : 'border-border text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[11px]">메모</Label>
                  <Textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    rows={2}
                    className="max-h-24 resize-none text-xs"
                  />
                </div>
              </div>
            )}
          </div>
          )}

          {/* 계산 결과를 입력 중에 보여준다 — 오타를 즉시 발견하게 하는 장치다. */}
          {amount && (
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
              <Row
                label={side === 'BUY' ? '총 매수금액' : '총 매도금액'}
                value={fmtNative(Math.abs(amount.netCashFlow))}
                strong
              />
            </div>
          )}

          {oversold && (
            <p className="text-xs text-destructive">
              보유 수량({fmtQty(available)})보다 많이 매도할 수 없습니다. 기초잔고가 빠졌다면 보유 종목에서 먼저 채워주세요.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-[10px]">· {hint}</span>}
      </span>
      <span className={cn('font-mono', strong && 'font-semibold')}>{value}</span>
    </div>
  );
}
