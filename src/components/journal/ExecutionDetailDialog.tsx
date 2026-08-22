import { OpeningBalanceBadge } from '@/components/journal/OpeningBalanceBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { returnColor } from '@/lib/calc/rebalance';
import { computeExecutionAmount, currencyOf } from '@/lib/journal/cost';
import type { ClosedLot } from '@/lib/journal/replay';
import { fmtQty, fmtUsd, fmtWon } from '@/lib/format';
import type { Execution, TradeNote } from '@/types/journal';
import type { Holding } from '@/types/domain';

/** 로컬 시간대 'YYYY-MM-DD HH:mm'. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t border-border py-2 first:border-t-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-right font-mono text-sm">{children}</div>
    </div>
  );
}

/**
 * 테이블 행 클릭으로 여는 읽기 전용 상세 — 수정/삭제는 여기서만 진입한다
 * (테이블 자체에는 더 이상 인라인 액션 버튼이 없다). 수정은 기존
 * ExecutionFormDialog(편집 모드)를 그대로 재사용한다 — 폼 로직을 여기 새로
 * 만들지 않는다.
 */
export function ExecutionDetailDialog({
  execution,
  open,
  onOpenChange,
  holding,
  closedLot,
  note,
  krwRate,
  onEdit,
  onDelete,
}: {
  execution: Execution | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: Holding | undefined;
  closedLot: ClosedLot | undefined;
  /** EXECUTION 타깃 근거 — 태그·메모. */
  note: TradeNote | undefined;
  krwRate: number | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {execution && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span style={{ color: execution.side === 'BUY' ? 'var(--diff-rise)' : 'var(--diff-fall)' }}>
                  {execution.side === 'BUY' ? '매수' : '매도'}
                </span>
                {holding?.name ?? '삭제된 종목'}
                {execution.intent === 'OPENING_BALANCE' && <OpeningBalanceBadge />}
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col">
              <DetailRow label="종목">
                {holding?.name ?? '삭제된 종목'}
                {holding?.ticker && <span className="ml-1 text-muted-foreground">{holding.ticker}</span>}
              </DetailRow>
              <DetailRow label="일시">{formatDateTime(execution.executedAt)}</DetailRow>
              {(() => {
                const currency = holding ? currencyOf(holding.region) : 'KRW';
                const fmt = (n: number) => (currency === 'USD' ? fmtUsd(n) : fmtWon(n));
                const { grossAmount } = computeExecutionAmount({
                  side: execution.side,
                  qty: execution.qty,
                  price: execution.price,
                  region: holding?.region ?? '국내',
                });
                return (
                  <>
                    <DetailRow label="수량">{fmtQty(execution.qty)}</DetailRow>
                    <DetailRow label="단가">{fmt(execution.price)}</DetailRow>
                    <DetailRow label="총액">
                      {fmt(grossAmount)}
                      {currency === 'USD' && (
                        <div className="text-[11px] font-normal text-muted-foreground">
                          {krwRate !== undefined ? `≈ ${fmtWon(grossAmount * krwRate)}` : '환율 조회 중...'}
                        </div>
                      )}
                    </DetailRow>
                    {closedLot && (
                      <DetailRow label="실현손익">
                        <span className="font-semibold" style={{ color: returnColor(closedLot.realizedPnl) }}>
                          {closedLot.realizedPnl >= 0 ? '+' : ''}
                          {fmt(closedLot.realizedPnl)}
                        </span>
                        {currency === 'USD' && (
                          <div className="text-[11px] font-normal text-muted-foreground">
                            {krwRate !== undefined
                              ? `≈ ${closedLot.realizedPnl >= 0 ? '+' : ''}${fmtWon(closedLot.realizedPnl * krwRate)}`
                              : '환율 조회 중...'}
                          </div>
                        )}
                      </DetailRow>
                    )}
                  </>
                );
              })()}
              {note?.body && (
                <div className="border-t border-border py-2">
                  <div className="mb-1 text-xs text-muted-foreground">메모</div>
                  <p className="text-left text-sm whitespace-pre-wrap">{note.body}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="destructive" onClick={onDelete}>
                삭제
              </Button>
              <Button onClick={onEdit}>수정</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
