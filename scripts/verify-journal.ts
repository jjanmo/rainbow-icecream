/**
 * 매매일지 계산 검증 — 리플레이(lib/journal/replay.ts) 핵심 시나리오.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-journal.ts
 *
 * 아직 테스트 러너가 아니라 실행 스크립트다(프로젝트에 러너가 없다). vitest 등을
 * 도입하면 이 파일을 그대로 테스트로 승격할 것.
 *
 * 수수료·증권거래세 계산은 ADR-0034로 제거했다 — 이 스크립트도 그 요율표
 * 시나리오(ETF 면세, 요율 소급 등)를 함께 걷어냈다.
 *
 * 환율 저장(fxRate)도 ADR-0038로 제거했다 — 실현손익은 거래 통화 기준으로만
 * 계산하고 원화로 환산하지 않는다. 그래서 예전의 "환차손익 분해" 시나리오도
 * 함께 걷어내고, 대신 해외 종목 실현손익이 환율과 무관하게 달러 그대로
 * 나오는지 확인하는 시나리오로 바꿨다.
 */
import { replayHolding } from "@/lib/journal/replay";
import type { Execution } from "@/types/journal";

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}  got=${JSON.stringify(got)}${ok ? "" : ` want=${JSON.stringify(want)}`}`);
  if (ok) pass++; else fail++;
}
const ex = (o: Partial<Execution>): Execution => ({
  id: o.id ?? "e", userId: "u", holdingId: "h", side: o.side ?? "BUY", intent: o.intent ?? "NEW",
  executedAt: o.executedAt ?? "2026-08-17T00:32:00Z", qty: o.qty ?? 0, price: o.price ?? 0,
  createdAt: "2026-08-17T00:00:00Z",
});

console.log("Scenario 1 — 국내 개별주 매수");
const s1 = replayHolding([ex({ id: "1", side: "BUY", qty: 10, price: 70000 })], { region: "국내" });
eq("보유수량", s1.qty, 10);
eq("totalCost", s1.totalCost, 700000);
eq("avgPrice", s1.avgPrice, 70000);

console.log("Scenario 2 — 국내 개별주 매도 (실현손익)");
const s2 = replayHolding([
  ex({ id: "1", side: "BUY", qty: 10, price: 70000, executedAt: "2026-08-17T00:32:00Z" }),
  ex({ id: "2", side: "SELL", qty: 10, price: 75000, executedAt: "2026-08-20T00:00:00Z" }),
], { region: "국내" });
eq("realizedPnl", s2.closedLots[0].realizedPnl, 50000);
eq("보유수량 0", s2.qty, 0);
eq("totalCost 0", s2.totalCost, 0);
eq("전량청산", s2.closedLots[0].isFullExit, true);
eq("보유일수", s2.closedLots[0].holdingDays, 3);

console.log("Scenario 5 — 해외 주식 실현손익은 환율과 무관하게 달러 그대로");
const s5 = replayHolding([
  ex({ id: "1", side: "BUY", qty: 10, price: 100, executedAt: "2026-01-01T00:00:00Z" }),
  ex({ id: "2", side: "SELL", qty: 10, price: 110, executedAt: "2026-02-01T00:00:00Z" }),
], { region: "해외" });
eq("실현손익(USD)", s5.closedLots[0].realizedPnl, 100);

console.log("Scenario 7 — 소수점 매매 후 전량 매도");
const s7 = replayHolding([
  ex({ id: "1", side: "BUY", qty: 0.1, price: 100 }),
  ex({ id: "2", side: "BUY", qty: 0.2, price: 100 }),
  ex({ id: "3", side: "SELL", qty: 0.3, price: 100, executedAt: "2026-09-01T00:00:00Z" }),
], { region: "해외" });
eq("잔여 수량 정확히 0", s7.qty, 0);
eq("잔여 원가 정확히 0", s7.totalCost, 0);

console.log("보유 초과 매도 차단");
const over = replayHolding([
  ex({ id: "1", side: "BUY", qty: 5, price: 100 }),
  ex({ id: "2", side: "SELL", qty: 10, price: 100, executedAt: "2026-09-01T00:00:00Z" }),
], { region: "국내" });
eq("oversold 감지", over.oversold.length, 1);
eq("수량 보존", over.qty, 5);

console.log("부분 재계산 == 전체 재계산 (ADR-0032 불변식)");
const all = [
  ex({ id: "1", side: "BUY", qty: 6, price: 69800, executedAt: "2026-08-13T00:00:00Z" }),
  ex({ id: "2", side: "BUY", qty: 4, price: 70300, executedAt: "2026-08-15T00:00:00Z" }),
  ex({ id: "3", side: "SELL", qty: 10, price: 75000, executedAt: "2026-08-17T00:00:00Z" }),
];
const ctx = { region: "국내" as const };
eq("정렬 순서 무관", JSON.stringify(replayHolding([...all].reverse(), ctx)), JSON.stringify(replayHolding(all, ctx)));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
