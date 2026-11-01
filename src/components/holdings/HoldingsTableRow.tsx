import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { Drawdown52w } from "@/lib/calc/high52w";
import { costKrwOf, diffColor, returnColor, type HoldingCalc } from "@/lib/calc/rebalance";
import {
  buyPlanCell,
  PLAN_LINE_STATUS_COLOR,
  planLineText,
  TRADE_PLAN_SIGNAL_BG,
  tradePlanSignalOf,
  type PlanLine,
} from "@/lib/calc/tradePlan";
import { fmtQty, fmtSigned, fmtUsd, fmtWon } from "@/lib/format";
import { FitText } from "./FitText";

export function HoldingsTableRow({
  holding,
  usdKrwRate,
  drawdown,
  drawdownLoading,
  onEdit,
  onDelete,
}: {
  holding: HoldingCalc;
  /** 해외 종목의 투입 원가를 원화로 바꾼다 — 매입금액 열 표시와 정찰병(원화) 금액
   * 비교에 쓴다. 표 하단 총 매입금액과 같은 실시간 환율이다. */
  usdKrwRate: number;
  /** 52주 고점 대비 하락률(ADR-0065). null = 현금성·조회 실패 — 0%로 보이면 안 된다. */
  drawdown: Drawdown52w | null;
  drawdownLoading: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isOverseas = holding.nativeCurrency === "USD";
  const costKrw = costKrwOf(holding, usdKrwRate);
  const signal = tradePlanSignalOf(holding, usdKrwRate);
  // 손절 신호만 행을 칠한다 — 정찰병 미달은 색 없음(TRADE_PLAN_SIGNAL_BG 참고).
  const rowBg = signal ? TRADE_PLAN_SIGNAL_BG[signal] : undefined;
  const plan = buyPlanCell(holding, costKrw);
  const planTexts = plan?.kind === "CAP" ? [plan.scout, plan.max].flatMap((l) => (l ? [planLineText(l)] : [])) : [];
  const planSizeBy = planTexts.reduce((a, b) => (b.length > a.length ? b : a), "");

  return (
    <TableRow style={rowBg ? { backgroundColor: rowBg } : undefined}>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <div className="min-w-0">
            <FitText className="font-semibold">{holding.name}</FitText>
            <FitText className="font-mono text-muted-foreground">{holding.ticker || " "}</FitText>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <FitText className="font-mono">{fmtQty(holding.qty)}</FitText>
      </TableCell>
      <TableCell className="text-right">
        <FitText className="font-mono">{isOverseas ? fmtUsd(holding.avgPrice) : fmtWon(holding.avgPrice)}</FitText>
      </TableCell>
      <TableCell className="text-right">
        <FitText className={`font-mono ${holding.hasLivePrice ? "" : "text-muted-foreground"}`}>
          {fmtWon(holding.priceKrw)}
        </FitText>
        {isOverseas && (
          <FitText className="font-mono text-muted-foreground">{fmtUsd(holding.priceNative)}</FitText>
        )}
      </TableCell>
      <TableCell className="text-right">
        <FitText className="font-mono">{fmtWon(costKrw)}</FitText>
        {isOverseas && (
          <FitText className="font-mono text-muted-foreground">{fmtUsd(holding.qty * holding.avgPrice)}</FitText>
        )}
      </TableCell>
      <TableCell className="text-right">
        <FitText className="font-mono">{fmtWon(holding.value)}</FitText>
        {isOverseas && (
          <FitText className="font-mono text-muted-foreground">{fmtUsd(holding.valueNative)}</FitText>
        )}
      </TableCell>
      <TableCell className="text-right">
        <FitText className="font-mono font-semibold" style={{ color: returnColor(holding.returnPct) }}>
          {fmtSigned(holding.returnPct)}
        </FitText>
      </TableCell>
      <TableCell className="text-right">
        {drawdown ? (
          <>
            <FitText className="font-mono" style={{ color: diffColor(drawdown.drawdownPct) }}>
              {fmtSigned(drawdown.drawdownPct)}
            </FitText>
            {/* 2줄: 고점 가격(종목 통화). 상장 1년 미만이면 52주를 다 못 채운 고점이라 표시해 둔다. */}
            <FitText className="font-mono text-muted-foreground">
              {`${drawdown.partial ? "1년 미만 · " : ""}${isOverseas ? fmtUsd(drawdown.high) : fmtWon(drawdown.high)}`}
            </FitText>
          </>
        ) : (
          <FitText className="text-muted-foreground">{drawdownLoading ? "…" : "-"}</FitText>
        )}
      </TableCell>
      <TableCell className="text-right">
        {/* 매매 계획(ADR-0064) — 최대 금액 지정·적립식일 때만 내용이 있다. 최대 금액 지정은 2줄을
            서로 왼쪽으로 맞춘 블록을 셀 오른쪽 끝에 붙인다 — 열의 오른쪽 정렬은 유지하면서 두 줄의
            시작점을 맞추기 위해서다. */}
        {plan?.kind === "CAP" ? (
          <div className="inline-block max-w-full text-left align-top">
            {/* 두 줄 글자 크기를 더 긴 줄 기준으로 맞춘다. */}
            <FitText className={plan.scout ? "font-mono" : "text-muted-foreground"} sizeBy={planSizeBy}>
              {plan.scout ? <PlanLineText line={plan.scout} /> : "-"}
            </FitText>
            <FitText className="font-mono" sizeBy={planSizeBy}>
              <PlanLineText line={plan.max} />
            </FitText>
          </div>
        ) : (
          <FitText className={plan ? "font-mono" : "text-muted-foreground"}>{plan?.text ?? "-"}</FitText>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-0.5">
          <Button variant="ghost" size="icon-xs" onClick={onEdit} className="text-muted-foreground">
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onDelete} className="text-muted-foreground">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** "200만원(180만원)" — 괄호 안만 부족(빨강)/초과(파랑)로 칠한다. 완료는 색 없음. */
function PlanLineText({ line }: { line: PlanLine }) {
  const { status } = line;
  return (
    <>
      {line.amount}(
      {status.kind === "DONE" ? (
        "완료"
      ) : (
        <span style={{ color: PLAN_LINE_STATUS_COLOR[status.kind] }}>{status.text}</span>
      )}
      )
    </>
  );
}
