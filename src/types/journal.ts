/** 매매일지 도메인 타입. 계산 규칙은 lib/journal/ 에, 결정 근거는 ADR-0027~0032. */

export type Side = "BUY" | "SELL";

export type ExecutionIntent =
  | "OPENING_BALANCE" // 매매일지 도입 전부터 들고 있던 잔고 (ADR-0027)
  | "NEW" // 신규 진입
  | "ADD" // 추가매수
  | "SCALE_OUT" // 분할 익절
  | "EXIT" // 전량 청산
  | "STOP_LOSS" // 손절
  | "REBALANCE" // 비중 조정
  | "CORPORATE_ACTION"; // 액면분할/무상증자 등 수동 조정 탈출구

export type ExitReason = "THESIS_MET" | "THESIS_BROKEN" | "REBALANCE" | "STOP_HIT" | "EMOTIONAL";

export type NoteTargetType = "EXECUTION" | "POSITION" | "DAY";

/**
 * 체결 원장 한 건. 이 앱에서 보유수량·평균매입가를 바꾸는 유일한 경로다 —
 * holdings.qty / holdings.avg_price 는 이 행들을 리플레이한 결과이며 독립적으로
 * 수정되지 않는다 (ADR-0027).
 *
 * price 는 종목의 원래 통화 기준(국내 KRW, 해외 USD)이고, fxRate 는 체결 시점에
 * 고정 저장된다 (ADR-0029). 수수료·증권거래세는 계산하지 않는다 — 증권사·이벤트
 * 할인율마다 달라 정밀 계산의 실익이 낮다고 판단해 뺐다 (ADR-0034).
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
  /** 원래 통화 → KRW. 국내 종목은 1. */
  fxRate: number;
  createdAt: string;
}

export type NewExecution = Omit<Execution, "id" | "userId" | "createdAt">;

/**
 * 정성 기록. 체결과 분리된 별도 엔티티다 — 분할 매수를 3번 해도 라지는 하나여야
 * 하므로 체결 컬럼으로 인라인하지 않는다 (ADR-0031).
 */
export interface TradeNote {
  id: string;
  userId: string;
  targetType: NoteTargetType;
  /** EXECUTION → executionId, POSITION → holdingId, DAY → 'YYYY-MM-DD' */
  targetKey: string;
  /** 사용자 정의 허용. 집계의 기반이므로 자동완성으로 재사용을 유도한다. */
  setupTags: string[];
  /** 고정 열거형. 자유 입력을 허용하지 않는다. */
  emotionTags: string[];
  exitReason: ExitReason | null;
  followedPlan: boolean | null;
  /** 라지가 깨지는 조건. 이게 없으면 "라지 훼손"과 "감정적 이탈"을 구분할 수 없다. */
  invalidationCondition: string | null;
  stopPrice: number | null;
  targetPrice: number | null;
  /** 자유 서술 — 어떤 집계에도 쓰이지 않는다. */
  body: string | null;
  createdAt: string;
}

export type NewTradeNote = Omit<TradeNote, "id" | "userId" | "createdAt">;

export const EMOTION_TAGS = ["조급함", "FOMO", "복수매매", "확신과잉", "무감정"] as const;

export const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  THESIS_MET: "라지 달성",
  THESIS_BROKEN: "라지 훼손",
  REBALANCE: "리밸런싱",
  STOP_HIT: "손절",
  EMOTIONAL: "감정적 이탈",
};

export const INTENT_LABELS: Record<ExecutionIntent, string> = {
  OPENING_BALANCE: "기초잔고",
  NEW: "신규진입",
  ADD: "추가매수",
  SCALE_OUT: "분할익절",
  EXIT: "전량청산",
  STOP_LOSS: "손절",
  REBALANCE: "리밸런싱",
  CORPORATE_ACTION: "권리변동",
};

/** 매수/매도 각각에서 고를 수 있는 의도. 기초잔고·권리변동은 사용자가 직접 고르지 않는다. */
export const BUY_INTENTS: ExecutionIntent[] = ["NEW", "ADD", "REBALANCE"];
export const SELL_INTENTS: ExecutionIntent[] = ["SCALE_OUT", "EXIT", "STOP_LOSS", "REBALANCE"];
