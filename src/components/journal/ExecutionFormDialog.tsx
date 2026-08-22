import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { computeExecutionAmount, currencyOf, normalizeQty } from '@/lib/journal/cost';
import { fmtQty, fmtUsd, fmtWon } from '@/lib/format';
import { ASSET_TYPE_LABELS, type AssetType, type Holding, type NewHolding, type Region } from '@/types/domain';
import type { Execution, NewExecution, NewTradeNote, Side, TradeNote } from '@/types/journal';

/** ExecutionFormDialog가 만드는 근거 초안. executionId는 아직 모른다(신규 체결의
 * id가 저장 후에야 확정) — journal.tsx가 채운다. */
export type ExecutionNoteDraft = Omit<NewTradeNote, 'executionId'>;

const ACCOUNT_TYPES = ['일반계좌', 'ISA', '연금저축', 'IRP', 'CMA', '파킹통장', '예적금', '기타'];
const ALL_ACCOUNTS = 'all';

/** `datetime-local` 값(로컬 시간, 초 없음) ↔ ISO8601(UTC) 변환. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 로컬 시간대 'YYYY-MM-DD'. 기초잔고(날짜 없음, ADR-0048)는 그 사실 그대로 표시한다. */
function formatLocalDate(iso: string | null): string {
  if (!iso) return '기초잔고';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 종목 콤보박스 표기 — 해외는 티커가 먼저 눈에 들어와야 알아보기 쉬우니 '티커(이름)',
 * 국내는 이름 그대로. */
function holdingOptionLabel(h: Holding): string {
  return h.region === '해외' && h.ticker ? `${h.ticker}(${h.name})` : h.name;
}

interface HoldingComboItem {
  value: string;
  label: string;
}

interface NewHoldingDraft {
  groupId: string;
  ticker: string;
  name: string;
  region: Region;
  account: string;
  assetType: AssetType;
}

const EMPTY_NEW_HOLDING: Omit<NewHoldingDraft, 'groupId'> = {
  ticker: '',
  name: '',
  region: '국내',
  account: '일반계좌',
  assetType: 'ETF',
};

const ASSET_TYPE_ITEMS = (Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((t) => ({
  label: ASSET_TYPE_LABELS[t],
  value: t,
}));

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
 * 매매 추가. 필수 입력을 종목·구분·수량·단가·체결일시로 유지한다 — 근거 섹션은
 * 선택 입력이라, 채우지 않아도 저장할 수 있다. 입력 마찰이 커지면 기록 자체를
 * 안 하게 된다.
 *
 * 매매 의도(신규진입/추가매수/...) 세부 구분은 받지 않는다 (ADR-0041). 다만
 * "기초잔고"인지는 "+ 새 종목" 흐름에서만 체크박스로 구분한다 — 이게
 * OPENING_BALANCE의 유일한 존재 이유다: 실제 매매가 아닌 이월 잔고를 실제
 * 매매처럼 기록하면 보유일수·매매 횟수 같은 집계가 왜곡된다 (ADR-0044). 기초
 * 잔고는 "매매일"이라는 게 없는 개념이라 체결일시를 받지 않는다 (ADR-0048).
 * 기존 종목을 고르는 흐름에는 필요 없다 — 새 종목의 시작점을 등록할 때만
 * 의미가 있다 (ADR-0050). 새 종목은 아직 하나도 없는 걸 팔 수 없으므로 매매
 * 구분이 항상 매수로 고정된다.
 *
 * 수수료·증권거래세는 계산하지 않는다 — 증권사·이벤트 할인율마다 달라 정밀
 * 계산의 실익이 낮다고 판단해 뺐다 (ADR-0034).
 *
 * 환율도 입력받지 않는다 — 해외 종목은 항상 달러 기준으로만 기록·표시하고
 * 원화로 환산하지 않는다 (ADR-0038).
 *
 * holdings.qty/avg_price를 바꾸는 유일한 경로가 이 다이얼로그다(ADR-0044) — 보유
 * 종목 화면은 더 이상 그 값을 받지 않는다. 현금성 자산(예적금 등, ticker 없음)도
 * 예외 없이 여기서만 등록한다.
 */
export function ExecutionFormDialog({
  open,
  onOpenChange,
  holdings,
  executions,
  groupOptions,
  tradeNotes,
  onSubmit,
  editingExecution,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holdings: Holding[];
  /** 매수 시 근거 프리필, 매도 시 매수 이력 표시에 쓴다 — 전체 체결이 필요하다. */
  executions: Execution[];
  groupOptions: { id: string; name: string }[];
  /** 수정 모드에서 이 체결에 이미 달린 근거를 불러오기 위해 필요하다. */
  tradeNotes: TradeNote[];
  onSubmit: (submit: ExecutionSubmit) => void;
  /** 지정하면 새 체결 추가가 아니라 이 체결을 고치는 모드로 연다 — 종목은 바꿀
   * 수 없다(다른 종목으로 옮기는 건 별도 리플레이 대상이 둘이 되는 문제라 지원하지
   * 않는다). 근거는 이 체결에 달린 것을 그대로 불러와 수정할 수 있다. */
  editingExecution?: Execution | null;
  /** note가 null이면 근거를 비워서 저장한 것 — 기존 근거 행을 지워야 한다.
   * undefined와 구분하는 이유: 수정 모드에선 항상 셋 중 하나를 명확히 알 수 있다
   * (내용 있음/비움/애초에 없었음이지만 비움과 동일하게 처리해도 무해하다). */
  onUpdate?: (input: { id: string; patch: Omit<NewExecution, 'holdingId'>; note: ExecutionNoteDraft | null }) => void;
}) {
  const [side, setSide] = useState<Side>('BUY');
  const [holdingId, setHoldingId] = useState('');
  const [accountFilter, setAccountFilter] = useState(ALL_ACCOUNTS);
  const [isNewHolding, setIsNewHolding] = useState(false);
  const [isCash, setIsCash] = useState(false);
  const [isOpeningBalance, setIsOpeningBalance] = useState(false);
  const [qtyText, setQtyText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [executedAtLocal, setExecutedAtLocal] = useState('');
  const [newHolding, setNewHolding] = useState<NewHoldingDraft>({ groupId: '', ...EMPTY_NEW_HOLDING });
  const [noteBody, setNoteBody] = useState('');
  const [prevOpen, setPrevOpen] = useState(open);

  const holdingById = useMemo(() => new Map(holdings.map((h) => [h.id, h])), [holdings]);

  /** 그 종목의 매수 체결에 달린 근거 중 내용이 있는 것만, 시간순으로. 기초잔고는
   * 날짜가 없지만(ADR-0048) 개념상 항상 가장 이른 매수이므로 맨 앞에 온다. */
  function buyNotesFor(id: string): { execution: Execution; body: string }[] {
    return executions
      .filter((e) => e.holdingId === id && e.side === 'BUY')
      .sort((a, b) => (a.executedAt ?? '').localeCompare(b.executedAt ?? ''))
      .flatMap((e) => {
        const body = tradeNotes.find((n) => n.executionId === e.id)?.body;
        return body ? [{ execution: e, body }] : [];
      });
  }

  // 열릴 때 초기화 — effect 가 아니라 렌더 중 조정한다 (프로젝트 컨벤션).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && editingExecution) {
      const existingNote = tradeNotes.find((n) => n.executionId === editingExecution.id);
      const holding = holdings.find((h) => h.id === editingExecution.holdingId);
      setSide(editingExecution.side);
      setHoldingId(editingExecution.holdingId);
      setAccountFilter(holding?.account ?? ALL_ACCOUNTS);
      setIsNewHolding(false);
      setIsCash(false);
      setIsOpeningBalance(editingExecution.intent === 'OPENING_BALANCE');
      setQtyText(String(editingExecution.qty));
      setPriceText(String(editingExecution.price));
      setExecutedAtLocal(editingExecution.executedAt ? toLocalInputValue(editingExecution.executedAt) : '');
      setNoteBody(existingNote?.body ?? '');
    } else if (open) {
      setSide('BUY');
      setHoldingId(holdings[0]?.id ?? '');
      setAccountFilter(ALL_ACCOUNTS);
      setIsNewHolding(holdings.length === 0);
      setIsCash(false);
      setIsOpeningBalance(false);
      setQtyText('');
      setPriceText('');
      setExecutedAtLocal(toLocalInputValue(new Date().toISOString()));
      setNewHolding({ groupId: groupOptions[0]?.id ?? '', ...EMPTY_NEW_HOLDING });
      setNoteBody('');
    }
  }

  const selected = holdings.find((h) => h.id === holdingId);
  const region: Region = isNewHolding ? newHolding.region : (selected?.region ?? '국내');
  const currency = currencyOf(region);

  const qty = isNewHolding && isCash ? 1 : normalizeQty(parseFloat(qtyText) || 0);
  const price = parseFloat(priceText) || 0;
  // 기초잔고는 날짜를 받지 않는다 — executed_at은 항상 null이다 (ADR-0048).
  const executedAt = isOpeningBalance ? null : executedAtLocal ? new Date(executedAtLocal).toISOString() : null;

  const amount = qty > 0 && price > 0 ? computeExecutionAmount({ side, qty, price, region }) : null;

  // 매도는 보유 수량을 넘을 수 없다 — 저장 후 리플레이에서 거부되므로 여기서 먼저 막는다.
  // 수정 모드는 서버 쪽 리플레이가 최종 판단을 하므로 여기서 미리 막지 않는다
  // (기존 체결 하나를 고치는 거라 "지금 보유 수량"과 단순 비교가 맞지 않는다).
  const available = selected?.qty ?? 0;
  const oversold = !editingExecution && side === 'SELL' && !isNewHolding && qty > available;

  const canSubmit =
    qty > 0 &&
    price > 0 &&
    (isOpeningBalance || !!executedAt) &&
    !oversold &&
    (isNewHolding
      ? !!newHolding.groupId &&
        (isCash || newHolding.ticker.trim().length > 0) &&
        newHolding.name.trim().length > 0 &&
        side === 'BUY'
      : !!selected);

  const accountOptions = useMemo(
    () =>
      [...new Set(holdings.map((h) => h.account).filter((a): a is string => !!a))].sort((a, b) =>
        a.localeCompare(b, 'ko'),
      ),
    [holdings],
  );
  const holdingComboItems = useMemo(
    () =>
      holdings
        .filter((h) => accountFilter === ALL_ACCOUNTS || h.account === accountFilter)
        .map((h) => ({ value: h.id, label: holdingOptionLabel(h) })),
    [holdings, accountFilter],
  );
  const buyHistory = selected ? buyNotesFor(selected.id) : [];

  function prefillNoteIfEmpty(id: string) {
    if (noteBody.trim()) return;
    const history = buyNotesFor(id);
    const latest = history[history.length - 1];
    if (latest) setNoteBody(latest.body);
  }

  function handleAccountFilterChange(account: string) {
    setAccountFilter(account);
    // 지금 고른 종목이 새 계좌 필터에 안 맞으면 선택을 비운다.
    if (account !== ALL_ACCOUNTS && selected && selected.account !== account) {
      setHoldingId('');
    }
  }

  function handleHoldingChange(id: string) {
    setHoldingId(id);
    // 콤보박스에서 직접 고르면 계좌 필터를 그 종목 계좌로 맞춰 둘이 계속 일치하게 한다.
    const h = holdingById.get(id);
    if (h?.account) setAccountFilter(h.account);
    // 매수 화면에서 종목을 고르면, 메모를 아직 안 썼다면 그 종목의 최근 매수 메모를 프리필한다.
    if (side === 'BUY') prefillNoteIfEmpty(id);
  }

  function handleSideChange(s: Side) {
    setSide(s);
    if (s === 'SELL') setIsNewHolding(false);
    else if (selected) prefillNoteIfEmpty(selected.id);
  }

  /** 새 종목은 항상 매수만 가능하다 — 아직 갖고 있지 않은 걸 팔 수는 없다. */
  function toggleNewHolding() {
    setIsNewHolding((v) => {
      const next = !v;
      if (next) setSide('BUY');
      else setIsOpeningBalance(false);
      return next;
    });
    setIsCash(false);
  }

  function selectCashCurrency(cashRegion: Region, checked: boolean) {
    if (checked) {
      setIsCash(true);
      setNewHolding((d) => ({ ...d, region: cashRegion, ticker: '' }));
    } else {
      setIsCash(false);
    }
  }

  // 근거 섹션에 뭔가 입력했을 때만 채운다 — 빈 노트 행을 만들지 않는다.
  function buildNoteDraft(): ExecutionNoteDraft | undefined {
    const trimmedBody = noteBody.trim();
    if (!trimmedBody) return undefined;
    return { body: trimmedBody };
  }

  function handleSubmit() {
    if (!canSubmit || !amount) return;
    const execution: Omit<NewExecution, 'holdingId'> = {
      side,
      intent: isOpeningBalance ? 'OPENING_BALANCE' : 'NEW',
      executedAt,
      qty,
      price,
    };
    if (editingExecution) {
      // 수정 모드는 add 모드의 buildNoteDraft(빈 값=undefined="아무것도 안 함")와
      // 달리, 비운 것과 아무것도 안 한 것을 구분할 필요가 없다 — 항상 지금 textarea
      // 내용대로 맞춘다(있으면 upsert, 비었으면 기존 근거 삭제).
      onUpdate?.({ id: editingExecution.id, patch: execution, note: buildNoteDraft() ?? null });
      onOpenChange(false);
      return;
    }
    const note = buildNoteDraft();
    if (isNewHolding) {
      onSubmit({
        newHolding: {
          groupId: newHolding.groupId,
          ticker: isCash ? null : newHolding.ticker.trim() || null,
          name: newHolding.name.trim(),
          targetPctInGroup: 0,
          // 새 종목은 수량 0 으로 만들고 이 체결이 채운다 — 기초잔고가 아니다.
          qty: 0,
          avgPrice: 0,
          account: newHolding.account,
          region: newHolding.region,
          assetType: newHolding.assetType,
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

  const fmtNative = (n: number) => (currency === 'USD' ? fmtUsd(n) : fmtWon(n));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingExecution ? '매매 수정' : '매매 추가'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* 새 종목은 아직 하나도 없는 걸 파는 게 성립하지 않으므로 매수 고정,
              수정 모드는 매매 구분 자체를 바꿀 수 없다(ADR-0049) — 이 두 경우엔
              토글 대신 지금 값을 고정 라벨로만 보여준다. */}
          {isNewHolding || editingExecution ? (
            <div
              className="rounded-lg border border-border bg-muted/40 py-2 text-center text-sm font-semibold"
              style={{ color: side === 'BUY' ? 'var(--diff-rise)' : 'var(--diff-fall)' }}
            >
              {side === 'BUY' ? '매수' : '매도'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(['BUY', 'SELL'] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSideChange(s)}
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
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>
                종목 <span className="text-destructive">*</span>
              </Label>
              {side === 'BUY' && !editingExecution && (
                <button
                  type="button"
                  onClick={toggleNewHolding}
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  {isNewHolding ? '기존 종목에서 고르기' : '+ 새 종목'}
                </button>
              )}
            </div>
            {isNewHolding ? (
              <>
                <div className="flex flex-col gap-2.5 rounded-lg border border-dashed border-border p-2.5">
                  <div className="flex gap-2.5">
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Label className="text-[11px]">
                        자산군 <span className="text-destructive">*</span>
                      </Label>
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
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Label className="text-[11px]">
                        자산종류 <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        items={ASSET_TYPE_ITEMS}
                        value={newHolding.assetType}
                        onValueChange={(v) => v && setNewHolding((d) => ({ ...d, assetType: v as AssetType }))}
                      >
                        <SelectTrigger className="h-8 w-full text-xs">
                          <SelectValue />
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
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex w-20 flex-col gap-1.5">
                      <Label className="text-[11px]">
                        지역 <span className="text-destructive">*</span>
                      </Label>
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
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Label className="text-[11px]">
                        계좌 <span className="text-destructive">*</span>
                      </Label>
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
                  <div className="flex gap-2.5">
                    <div className="flex w-24 flex-col gap-1.5">
                      <Label className="text-[11px]">
                        {newHolding.region === '국내' ? '코드' : '티커'}{' '}
                        {!isCash && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        value={isCash ? '' : newHolding.ticker}
                        onChange={(e) => setNewHolding((d) => ({ ...d, ticker: e.target.value }))}
                        disabled={isCash}
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
                </div>

                <label className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={isOpeningBalance} onCheckedChange={(c) => setIsOpeningBalance(!!c)} />
                  기초잔고
                </label>
                <span className="-mt-2 ml-5.5 text-[10px] text-muted-foreground">
                  매매일지를 쓰기 전부터 갖고 있던 잔고입니다. 매매일 없이 저장되고, 매매 횟수·보유일수 집계에서
                  빠집니다.
                </span>
              </>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Select
                  items={[
                    { label: '전체', value: ALL_ACCOUNTS },
                    ...accountOptions.map((a) => ({ label: a, value: a })),
                  ]}
                  value={accountFilter}
                  onValueChange={(v) => v && handleAccountFilterChange(v)}
                  disabled={!!editingExecution}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_ACCOUNTS}>전체 계좌</SelectItem>
                    {accountOptions.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Combobox<HoldingComboItem>
                  items={holdingComboItems}
                  value={holdingComboItems.find((i) => i.value === holdingId) ?? null}
                  onValueChange={(item) => handleHoldingChange(item?.value ?? '')}
                  disabled={!!editingExecution}
                >
                  <ComboboxInput placeholder="종목 검색" className="w-full" />
                  <ComboboxContent>
                    <ComboboxEmpty>검색 결과가 없습니다.</ComboboxEmpty>
                    <ComboboxList>
                      {(item: HoldingComboItem) => (
                        <ComboboxItem key={item.value} value={item}>
                          {item.label}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
            )}
            {side === 'SELL' && selected && (
              <span className="text-[11px] text-muted-foreground">
                보유 {fmtQty(available)} · 평단 {fmtNative(selected.avgPrice)}
              </span>
            )}
          </div>

          {/* 그 종목을 살 때마다 남긴 메모 — "감정적 이탈"을 스스로 기록하게 만드는 장치. */}
          {side === 'SELL' && selected && (
            <div className="rounded-lg border border-dashed border-border p-2.5 text-xs">
              {buyHistory.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <div className="font-semibold text-muted-foreground">매수 메모 이력</div>
                  {buyHistory.map(({ execution: e, body }) => (
                    <div key={e.id} className="border-t border-border pt-1.5 first:border-t-0 first:pt-0">
                      <div className="text-[10px] text-muted-foreground">{formatLocalDate(e.executedAt)}</div>
                      <p className="whitespace-pre-wrap">{body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">매수 시 기록된 메모가 없습니다.</span>
              )}
            </div>
          )}

          {isNewHolding && isCash ? (
            <div className="flex flex-col gap-1.5">
              <Label>
                금액 ({currency}) <span className="text-destructive">*</span>
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
          ) : (
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
          )}

          {isNewHolding && (
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={isCash && newHolding.region === '국내'}
                  onCheckedChange={(c) => selectCashCurrency('국내', !!c)}
                />
                KRW
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={isCash && newHolding.region === '해외'}
                  onCheckedChange={(c) => selectCashCurrency('해외', !!c)}
                />
                $
              </label>
              <span className="text-[10px] text-muted-foreground">체크하면 코드 없이 종목명·금액만으로 등록</span>
            </div>
          )}

          {!isOpeningBalance && (
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
          )}

          {/* 선택 입력 — 채우지 않아도 저장할 수 있다. 매수/매도 동일한 형태다. */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">근거</Label>
            <Textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={3}
              placeholder="메모"
              className="max-h-32 resize-none text-xs"
            />
          </div>

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
              보유 수량({fmtQty(available)})보다 많이 매도할 수 없습니다. 매수를 먼저 기록해 수량을 채워주세요.
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

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
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
