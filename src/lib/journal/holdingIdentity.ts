import type { Holding } from "@/types/domain";

/** "같은 종목" 판단 기준 — 티커+지역(계좌는 무시). 전량 매도로 삭제된 뒤 다시 산 종목은
 * holding row가 여러 개로 나뉘어 있어도, 이 키가 같으면 하나의 종목으로 본다 — 매매일지 종목
 * 모드의 검색·이력 묶음과 종목 단위 메모(holding_notes.identity_key, ADR-0066)가 같은 키를 쓴다.
 * 현금성 자산(ticker null)은 이름으로 대신 구분한다. 키 형식을 바꾸면 기존 메모가 끊기므로
 * 바꾸지 말 것. */
export function holdingIdentityKey(h: Pick<Holding, "ticker" | "name" | "region">): string {
  return h.ticker ? `T:${h.ticker}|${h.region}` : `N:${h.name}|${h.region}`;
}
