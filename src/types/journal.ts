/** 매매일지 도메인 타입. 계산 규칙은 lib/journal/ 에, 결정 근거는 ADR-0027~0032, 0041~0043. */

export type Side = "BUY" | "SELL";

/** 세부 매매 의도(신규진입/추가매수/...) 구분은 뺐다 (ADR-0041) — OPENING_BALANCE로
 * 기초잔고와 실제 매매만 구분하면 되고, 그 외 구분은 UI에서 쓰지 않는다. */
export type ExecutionIntent =
  | "OPENING_BALANCE" // 매매일지 도입 전부터 들고 있던 잔고 (ADR-0027)
  | "NEW"; // 사용자가 기록한 실제 매매 — 매수/매도 모두 이 값 하나

/**
 * 체결 원장 한 건. 이 앱에서 보유수량·평균매입가를 바꾸는 유일한 경로다 —
 * holdings.qty / holdings.avg_price 는 이 행들을 리플레이한 결과이며 독립적으로
 * 수정되지 않는다 (ADR-0027).
 *
 * price 는 종목의 원래 통화 기준(국내 KRW, 해외 USD)이다. 환율은 저장하지
 * 않는다 — 실현손익은 거래 통화 기준으로만 보여주고 원화로 환산하지 않는다
 * (ADR-0038). 수수료·증권거래세는 계산하지 않는다 — 증권사·이벤트 할인율마다
 * 달라 정밀 계산의 실익이 낮다고 판단해 뺐다 (ADR-0034).
 */
export interface Execution {
  id: string;
  userId: string;
  holdingId: string;
  side: Side;
  intent: ExecutionIntent;
  /** ISO8601 */
  executedAt: string;
  qty: number;
  /** 종목의 원래 통화 기준 단가. */
  price: number;
  createdAt: string;
}

export type NewExecution = Omit<Execution, "id" | "userId" | "createdAt">;

/**
 * 정성 기록. 체결과 분리된 별도 엔티티다(ADR-0031). 구조화 필드(셋업/감정 태그,
 * 매도사유, 계획 여부, 청산조건, 손절가/목표가)는 자유 서술 하나로 단순화했고
 * (ADR-0041/0042), 체결 하나당 노트 하나로 고정했다 — POSITION/DAY 같은 다른
 * 대상에 붙는 노트는 더 이상 없다 (ADR-0043).
 */
export interface TradeNote {
  id: string;
  userId: string;
  executionId: string;
  /** 자유 서술 — 어떤 집계에도 쓰이지 않는다. */
  body: string | null;
  createdAt: string;
}

export type NewTradeNote = Omit<TradeNote, "id" | "userId" | "createdAt">;
