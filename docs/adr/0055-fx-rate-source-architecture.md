# ADR-0055: 환율 데이터 아키텍처 — 현재값은 Toss, 과거 확정값은 Frankfurter

## Status
Accepted

## Context

이 앱은 여러 화면에서 해외(USD) 보유종목을 원화로 환산해서 보여준다. 그런데 "환산"이 필요한 시점의 성격이 화면마다 다르다 — 어떤 곳은 "지금 이 순간 얼마인가"(평가금액)가 필요하고, 어떤 곳은 "그날 확정된 값"(매매일지의 과거 매수/매도 총액)이 필요하다. 이 둘을 하나의 API로 해결할 수 없었다:

- Toss Open API의 `/api/v1/exchange-rate`는 **라이브 시세 전용**이고 과거 날짜 조회 파라미터가 없다 — `date` 파라미터를 붙여도 무시되고 항상 현재 시세만 온다(2026-08-25 직접 curl로 확인, AGENTS.md 참고). 응답의 `validFrom`/`validUntil`을 보면 내부적으로 약 5분 간격 갱신이라, "지금 값"이라는 개념 자체가 뚜렷하다.
- 반면 매매일지는 체결일이 과거인 게 당연하고, 그 날짜의 환율이 필요하다. Toss로는 이걸 구할 방법이 없어서, ECB 기준환율을 제공하는 Frankfurter를 별도로 도입했다(`lib/fx/frankfurterProvider.ts`). ECB 기준환율은 매 영업일 하나씩만 발표되는 "고시환율" 성격이지 주식 종가 개념이 아니다(중앙은행 협의 절차, 매 영업일 1회) — 그래서 하루에 값이 하나뿐이고, 한 번 확정되면 영원히 안 바뀐다.

## Decision

두 경로를 목적에 따라 명확히 분리해서 쓴다 — 하나가 다른 하나를 대신하지 않는다.

**현재 환율 (평가금액용) — Toss**
`hooks/useExchangeRate.ts` → `/api/toss/exchange-rate` → `lib/toss/tossFxProvider.ts`. 1분 폴링(ADR-0005), `queryKey`가 `["exchange-rate", "USD", "KRW"]`로 고정돼 있어 같은 세션 안에서 여러 화면이 동시에 이 훅을 불러도 React Query가 폴링 하나로 묶어준다(중복 네트워크 호출 없음). 쓰이는 곳:
- `/holdings`, `/rebalance`, `/setup` — `useRebalanceData` → `lib/calc/rebalance.ts`가 보유종목 평가금액을 계산할 때.
- 매매일지 안에서도 **날짜가 없거나 지금 값이 필요한 경우**: 기초잔고(OPENING_BALANCE, `executed_at`이 없어 과거 환율 자체를 구할 방법이 없다 — ADR-0048)의 원화 환산, 종목 모드에서 기초잔고 몫을 표시할 때의 라이브 폴백.

**과거 환율 (매매일지의 확정 원화 환산용) — Frankfurter**
`hooks/useHistoricalFxRates.ts` → `/api/fx/historical-rates` → `lib/fx/frankfurterProvider.ts`. **매매일지(`journal.tsx`)에서만** 쓰인다 — 기간 모드·종목 모드가 실제 `executed_at`이 있는 체결들의 매수/매도 총액을 원화로 보여줄 때. 다른 화면은 전부 "지금 가치"만 필요하므로 이 경로를 쓸 일이 없다.

**두 경로는 섞지 않는다.** 평가금액에 과거 환율을 쓰거나, 매매일지의 확정 표시에 라이브 환율을 섞으면 각각의 목적(정확한 현재가 / 변하지 않는 과거 기록)이 깨진다. 새 화면에 환율이 필요해지면 "지금 값인가, 특정 과거 날짜의 확정값인가"부터 판단하고 맞는 훅을 골라야 한다.

## Consequences
- 서로 다른 외부 API 두 개(Toss, Frankfurter)에 대한 의존성을 유지해야 한다.
- 잘못 고르면 조용히 틀린다 — 예를 들어 평가금액에 실수로 Frankfurter(일별 확정값)를 쓰면 장중에도 안 바뀌는 "가짜 실시간" 화면이 되고, 반대로 매매일지 확정 표시에 라이브 환율을 쓰면 어제 봤던 실현손익이 오늘 또 바뀌는 문제가 생긴다(ADR-0029가 이미 겪고 기각한 문제).
- 과거 환율(Frankfurter)은 한 번 확정되면 절대 안 바뀌는 값이라, `fx_rate_daily` 테이블(유저 스코핑 없는 전역 참조 데이터, `rate_date` PK 하나만)에 read-through 캐시로 저장한다. `getUsdKrwHistoricalRates`(`lib/fx/frankfurterProvider.ts`)가 먼저 캐시를 읽고, 요청 구간에 빈 날짜가 하나라도 있을 때만 Frankfurter를 호출해 그 결과를 캐시에 저장(`lib/api/fxRateCache.ts`)한 뒤 합쳐서 돌려준다 — 그래서 같은 날짜를 두 번 API로 조회할 일이 없고, 한 유저가 채운 캐시를 다른 유저도 그대로 재사용한다. 체결 저장 시점이 아니라 **읽는(조회하는) 시점에** 채운다 — 그래야 매매일지 저장이 Frankfurter 가용성에 묶이지 않고, 이미 매매된 종목의 과거 환율도 별도 백필 없이 처음 조회되는 순간 자동으로 채워진다. 캐시 충돌은 `on conflict do nothing`으로 무시한다(같은 날짜는 항상 같은 값이므로 update 자체가 불필요 — RLS에도 insert 정책만 있고 update 정책은 없다). 현재 환율(Toss)은 캐싱 대상이 아니다 — 캐싱하는 순간 "현재"라는 의미를 잃기 때문에, 이미 있는 1분 폴링 + 세션 내 쿼리 공유가 이 데이터 성격에 맞는 유일한 최적화다.
