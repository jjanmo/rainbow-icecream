# 매매일지 — 진행 상황 인수 메모

> **임시 문서다.** M3(일지 화면·노트/태그)까지 끝나면 삭제한다. 제품 요구사항은
> [PRD.md](./PRD.md) §3, 결정 근거는 [adr/0027~0032](./adr/)에 있으므로 여기에는
> "어디까지 했고 어디서부터 하면 되는가"만 남긴다.
>
> 마지막 갱신: 2026-08-17 · 범위: M1(원장·비용계산) + M3(일지 화면) 중 M1 완료, M3 부분

---

## ⚠️ 이어서 작업하기 전에 반드시 먼저

**Supabase에 스키마를 적용하지 않으면 앱 전체가 동작하지 않는다.** `holdings` 조회
select에 `market`, `asset_type` 이 들어갔는데 DB에 그 컬럼이 없으면 PostgREST가
`42703` 을 반환하고, `useHoldings` 를 쓰는 **모든 화면**(설정·비중 체크·보유 종목·
매매일지)이 함께 깨진다.

1. Supabase SQL Editor에서 [`supabase/schema.sql`](../supabase/schema.sql) 의
   `-- 매매일지 (trading journal)` 블록 이하를 실행한다.
   - 하단 `insert into executions ... OPENING_BALANCE` 마이그레이션까지 포함이며 **멱등**이라
     여러 번 실행해도 안전하다.
2. 적용 확인: 보유 종목 화면이 정상적으로 뜨면 컬럼 추가 성공.
3. `/journal` 에서 체결 1건 입력 → 보유 종목의 수량·평단이 합산되는지 확인.

---

## 완료된 것

### 도메인 · 계산 (M1 완료)

| 파일 | 역할 |
|---|---|
| `supabase/schema.sql` | `executions` / `trade_notes` / `account_fee_rates`, `holdings.market`·`asset_type`, RLS, 기초잔고 마이그레이션 |
| `src/types/journal.ts` | 체결·노트 도메인 타입, 의도/감정/매도사유 열거형과 라벨 |
| `src/lib/journal/taxRate.ts` | 증권거래세 요율표(날짜 기준) + **국내 ETF 매도 면세** 판정 |
| `src/lib/journal/cost.ts` | `roundCurrency`·`normalizeQty` (부동소수 방어) + `computeExecutionCost` |
| `src/lib/journal/replay.ts` | 순수 함수 리플레이 → 보유 수량·평단·청산 lot |
| `src/lib/journal/commit.ts` | 저장 → 리플레이 → `holdings` 반영, 실패 시 되돌림 |
| `src/lib/journal/marketMeta.ts` | 시장/자산유형 목록·라벨 |
| `src/lib/api/executions.ts` | 체결 CRUD (`deleted_at IS NULL` 기본 필터) |
| `src/hooks/useExecutions.ts` | 조회/추가/수정/삭제 + executions·holdings 캐시 동시 무효화 |

### 화면 (M3 부분)

| 파일 | 상태 |
|---|---|
| `src/pages/journal.tsx` | 월 달력(체결 있는 날 표시) + 날짜별/월별 체결 목록 + 삭제 |
| `src/components/journal/ExecutionFormDialog.tsx` | 매수/매도, 종목 선택 또는 **새 종목 즉시 등록**, 수량·단가·환율·체결일시, 의도 칩, **실시간 비용 계산 표시**, 보유 초과 사전 차단 |
| `TopNav` / `proxy.ts` | `/journal` 네비게이션 + 인증 보호 경로 등록 |

### 검증

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-journal.ts
```

원본 문서 §8 인수 기준을 그대로 옮긴 것으로 **21개 전부 통과**. 여기서 실제로
버그 2개를 잡았다 — 수수료 절사 방향(105원이 104원이 되던 것), 보유일수를 경과
밀리초로 재던 것.

---

## 알려진 한계 (의도적으로 남긴 것)

1. **체결이 있는 종목의 수량·평단을 보유 종목 화면에서 수동으로 고치면 다음
   리플레이가 덮어쓴다.** ADR-0027에 명시. 그 편집을 "기초잔고 체결 편집"으로
   바꾸는 것이 다음 과제.
2. 전량 매도 후 같은 종목 재진입 시 POSITION 노트가 재사용된다(`holdingId` 키).
   회차 개념이 없다 — ADR-0031 참고.
3. `CORPORATE_ACTION`(액면분할 등) 의도는 스키마에 있으나 입력 경로가 없다.
4. 배당(`CashFlow`)은 미구현. 원본 문서도 v1 비범위(E-5).
5. `account_fee_rates` 테이블은 있으나 설정 UI가 없어 항상 기본 요율이 적용된다.

## 미결정 사항

- **테스트 러너 도입 여부.** 프로젝트에 러너가 아예 없어서 검증이 실행 스크립트로만
  존재한다. `pnpm typecheck && pnpm lint && pnpm build` 규율에 테스트가 없는 상태.
  vitest를 넣을지 결정이 필요하다.
- 기초잔고를 사용자가 어디서 수정하게 할지 (보유 종목 모달 재해석 vs 일지 내 전용 경로).

---

## 다음 작업 순서

- [ ] **1. 스키마 적용 + 첫 동작 확인** (위 ⚠️ 절차) — 이걸 안 하면 아무것도 못 한다.
- [ ] **2. 문서 부채 정리** — 업로드된 원본 문서 중 아직 안 옮긴 것:
  - [ ] `docs/WIREFRAMES.md` — SC-1~SC-6 화면 구조. SC-3/4/5 구현할 때 필요하다.
  - [ ] PRD에 엣지 케이스(원본 §7 E-1~E-8) 반영. 코드엔 E-1·E-6·E-7만 반영돼 있다.
  - [ ] 마일스톤(원본 §9) — 이 파일이 임시로 그 역할을 하고 있다.
  - 원본 §5 계산 규칙 명세는 **의도적으로 안 옮겼다** — 이 프로젝트 PRD는 함수명·상수값
    같은 구현 디테일을 넣지 않는 규칙이라 코드와 ADR에 뒀다.
- [ ] **3. 노트/태그 UI** — 이 기능의 핵심 가치가 여기 있다.
  - [ ] 체결 입력 시트에 근거 섹션(셋업 태그·감정·청산조건·손절가) 추가
  - [ ] **매도 화면 상단에 그 종목의 매수 근거와 청산조건을 띄우기** — 원본 문서가
        "이 앱의 핵심 인터랙션"이라 부른 장치다. 이게 "감정적 이탈"을 스스로 기록하게 만든다.
  - [ ] `trade_notes` API/훅 (테이블·타입은 이미 있다)
- [ ] **4. SC-3 체결 상세 / 수정** — 지금은 삭제만 가능하고 수정 경로가 없다.
      `commitExecutionUpdate` 는 이미 있다.
- [ ] **5. 기초잔고 편집 경로** (위 한계 1 해소)
- [ ] **6. M4 성과 리포트** — `replayHolding` 이 이미 `closedLots`(실현손익·보유일수·
      전량청산 여부)를 반환하므로 집계와 화면만 남았다. `ClosedTrade` 테이블을 둘지
      파생 계산으로 갈지 결정 필요.
