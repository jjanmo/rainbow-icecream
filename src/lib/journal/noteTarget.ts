/**
 * trade_notes.target_key 빌더. targetType 별로 가리키는 대상이 다르므로
 * (EXECUTION → 체결 id, POSITION → 종목 id, DAY → 날짜) 문자열을 직접 다루지
 * 않고 이 함수들을 거친다 (ADR-0031).
 */

export function positionNoteKey(holdingId: string): string {
  return holdingId;
}

export function executionNoteKey(executionId: string): string {
  return executionId;
}

/** 로컬 시간대 기준 'YYYY-MM-DD'. pages/journal.tsx의 localDayKey와 동일 규칙. */
export function dayNoteKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
