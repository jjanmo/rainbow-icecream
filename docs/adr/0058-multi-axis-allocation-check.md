# ADR-0058: 비중 체크를 여러 축으로 확장한다 (① 시장 구현, ③ 변동성 보류)

## Status

Accepted — **① 시장 축만 살아있음** (2026-09-02 기준). **② 자산군 축은 이후 커스텀 탭(코드로만 존재, 커밋 전 폐기)을 거쳐 [ADR-0062](./0062-role-sector-fixed-axes.md)의 역할 축으로 대체됐다** (2026-09-25) — `asset_groups` 테이블·`group_id`는 더 이상 앱이 안 쓴다. 아래 "축 ② 자산군" 절은 역사적 기록으로 남긴다.
- **① 시장 축** (구현·유지): `holdings.exposure_region` + `axis_targets` 마이그레이션, 휴리스틱 백필, `computeAxisRebalance`(`lib/calc/axisRebalance.ts`), `/portfolio` 축 탭(현재는 `?axis=role|market`) + 시장 축 뷰/목표 편집, 종목 폼 2곳에 실질 지역 입력.
- **③ 변동성 축** (구현했다가 **되돌림**): σ 절대 임계값(방어<12/중립/공격>25)이 주식 위주 포트폴리오에 안 맞았다 — 100% 주식인 SCHD가 σ 17%로 "중립"에 걸리는 등, **"공격/중립/방어를 어떤 기준으로 나눌지" 자체가 아직 안 정해졌다.** 사용자가 그 기준을 더 고민하기로 하고 탭을 삭제. 관련 코드 전부 제거(`useRiskMetrics`, `lib/calc/risk.ts`, `RiskSummary`, `tossHistoryProvider`, `lib/api/priceDaily.ts`, `/api/toss/history`, `price_daily` 테이블 drop, `AxisTabs`/`AllocationAxis`/`axis_targets`에서 volatility 제거). 파이프라인 자체는 검증됐었다(실 포트폴리오 σ ≈ 20~26%, Toss 캔들 count=200 페이지네이션·공분산 계산 동작 확인) — 재도입 시 git 기록에서 되살릴 수 있다.
  - **재도입 시 결정할 것**(사용자 열린 질문): 절대 σ 임계값을 주식 기준으로 재조정(방어<18/공격>28) vs 베타 기준(SCHD 베타 ≈ 0.8) vs 상대 백분위 vs 2단계(공격/방어, 바벨). `asset_type IN ('CASH','BOND')` → 방어 확정, ticker 없는 FUND·조회 실패·이력 부족 → "측정 불가"는 유지할 만한 부분이었다.

## Context

지금 `/portfolio`의 비중 체크(ADR-0056으로 흡수됨)는 **사용자가 만든 자산군(`asset_groups`) 하나의 축**으로만 목표% 대비 실제%를 비교한다. 이 축만으로는 다음을 볼 수 없다:

- **리스크 수준** — "지금 포트폴리오가 공격적인가, 방어적인가, 감당 가능한 수준인가." 자산군은 전략(엣지_AI, 코어, 채권 등) 기준이라 변동성이 섞여 있다.
- **시장(지역) 익스포저** — "실제로 미국에 얼마, 한국에 얼마 투자하고 있나." `holdings.region`은 **상장 시장·통화**를 뜻하지 실질 경제 노출이 아니다. 사용자는 KRX 상장 미국 ETF(TIGER 미국나스닥, KODEX 미국AI광통신, TIME 글로벌AI 등)를 다수 보유하는데, 이들은 `region='국내'`지만 실질 노출은 미국이다.

축을 여러 개 두는 방향은 정했고, 어떤 지표가 필요하며 그 값을 실제로 구할 수 있는지 조사했다.

### 조사 결과 — Toss `/api/v1/candles` 실측 (2026-08-31, 직접 curl)

| 항목 | 결과 |
|---|---|
| `count` 최대 | **200** (초과 시 `400 invalid-request`). 1년치(약 252 거래일) = 2페이지 |
| `interval` 허용값 | **`1d`, `1m`만** — 주봉/월봉 없음 |
| 페이지네이션 | 응답의 `nextBefore`(문서에 없는 필드) 값을 `&before=<ISO timestamp>`로 넘긴다. `to`/`endDate`/`cursor` 등 다른 이름은 무시됨 |
| 역사 깊이 | 국내 대형주 2014년까지(12년+) 확인. 해외는 페이지당 약 9.5개월(미국 거래일 기준) |
| 지수 심볼 | **없음** — `KOSPI200`, `SPX`, `^GSPC` 등 전부 `404 stock-not-found` 또는 패턴 거부(`^[A-Za-z0-9.\-]+$`). 벤치마크는 유동 ETF로 대용해야 한다(국내 `069500` KODEX 200, 해외 `VOO`) |
| USD/KRW 히스토리 | Toss 캔들로 조회 불가(ADR-0055에서 이미 확인) → 과거 환율은 Frankfurter(`fx_rate_daily` 캐시)를 그대로 사용 |
| 레이트리밋 | 응답 헤더 `x-ratelimit-limit: 20`, `x-ratelimit-reset: 1` = **20건/초**(MARKET_DATA_CHART). 페이지네이션이 호출 수를 2배로 늘리므로, 종목당 1건을 가정한 `tossCandleProvider`의 `REQUESTS_PER_WINDOW`(12)를 그대로 쓰면 안 된다 |

### 조사 결과 — 실 포트폴리오(53개 종목)로 변동성 지표 계산 검증

최근 약 10개월 일간수익률(KRW 환산, 해외는 Frankfurter 과거 환율로 원화 변환)로:

- **종목별 연율 변동성 · 최대낙폭 · 베타**가 53개 중 52개 계산됨(실패는 신규 상장 인버스 ETN `530011` 1개 — 이력 부족).
- 레버리지도 정확히 반영: SOXL 연변동성 132% / 베타 6.1, QLD 베타 2.5.
- 포트폴리오 종합: 가중평균 변동성(분산효과 무시) 약 34.6% vs **공분산 행렬 기반 포트폴리오 변동성 약 21%** — 분산이 실제로 13%p 깎고 있음을 확인.
- 한계: 최근 국내 시장 변동성 급등 국면이라 KODEX 200(단순 지수 추종)조차 연 σ 48%로 나온다. **절대 임계값은 lookback 기간과 시장 국면에 민감하다.**

## Decision

**비중 체크를 3개 축으로 확장한다. 세 축 모두 같은 계산 엔진을 쓰고, "종목을 어느 버킷에 넣느냐"와 "목표%를 어디서 읽느냐"만 다르다.**

기존 `computeRebalance`(`lib/calc/rebalance.ts`)의 `GroupCalc`(→ `value`/`actualPct`/`diff`/`actionAmount`) 로직을 버킷 함수로 일반화한다:

```
computeAxisRebalance({ holdings, prices, usdKrwRate, bucketOf, targetOf })
  → 버킷별 { value, actualPct, targetPct, diff, actionAmount }   // 계산식은 GroupCalc 그대로
```

`diff`/`actionAmount`의 색·부호 규칙(ADR-0026, ADR-0056)은 세 축에서 동일하게 재사용한다.

### 축 ① 시장 (실질 익스포저 지역)

- **`holdings`에 `exposure_region` 컬럼(nullable)을 추가한다. 값은 `한국` / `미국` / `null`.**
  - **`null` = "특정 국가 익스포저가 아님"** → 시장 축에서 **`기타` 버킷**으로 집계한다. 현금성 자산(예수금, 파킹통장), 채권(개별채권·국고채 ETF), 원자재/귀금속 ETF(희소금속·금속·광산·은 등)가 여기 해당한다 — 이들은 "한국 시장이냐 미국 시장이냐"라는 축 위에 놓을 대상이 아니다.
  - "글로벌" 버킷과 종목별 미국 비중(`exposure_us_weight`) 필드는 **두지 않는다** — 검토했으나 기각. 현재 이 사용자의 미국 외(유럽·신흥국) *주식* 노출이 매우 낮고, 글로벌 주식 ETF도 실질 미국 비중이 대부분이라 `미국`으로 합쳐도 오차가 작다. ETF 룩스루 데이터는 Toss가 주지 않아 정확한 분해도 불가능하다. 일본·중국·인도 등 특정 국가 *주식시장*에 실제로 투자하게 되면 그때 버킷을 늘리고 재분류한다.
- **버킷 기준**:
  - `null(기타)`: `asset_type IN ('CASH', 'BOND')`, 또는 채권형 ETF(이름 `~ 국고채|국채|채권|Treasury`), 또는 원자재/귀금속 ETF(이름 `~ 금속|광산|희소금속|희토류|원자재|골드|은 ETF`).
  - `한국`: 그 외 `region='국내'`. 단 국내 상장이라도 미국/글로벌 *주식* 추종 ETF(이름 `~ 미국|글로벌|나스닥|S&P|해외`)는 `미국`.
  - `미국`: 그 외 `region='해외'` 전부(나스닥/NYSE 개별주, 미국 상장 ADR(TSM 등), 미국 상장 주식형 ETF). 우라늄/클린에너지처럼 테마가 원자재성이어도 **광산·에너지 기업 주식** ETF면 `미국`이지 `기타`가 아니다(예: NLR, ICLN).
- **목표% 저장**: 신규 `axis_targets` 테이블(아래). `기타`도 목표% 설정 대상 — 3버킷 합 100%.
- **마이그레이션(휴리스틱, 자동)**:
  ```sql
  alter table holdings add column exposure_region text
    check (exposure_region is null or exposure_region in ('한국', '미국'));
  -- 1) 해외 상장 = 미국 (개별주/ADR/주식형 ETF)
  update holdings set exposure_region = '미국' where region = '해외';
  -- 2) 국내 상장이지만 미국/글로벌 주식 추종 ETF
  update holdings set exposure_region = '미국'
    where region = '국내' and (name ~ '미국|글로벌|나스닥|S&P|해외');
  -- 3) 그 외 국내 상장 = 한국
  update holdings set exposure_region = '한국' where exposure_region is null and region = '국내';
  -- 4) 현금·채권·원자재는 국가 익스포저 아님 → null(기타)
  update holdings set exposure_region = null where asset_type in ('CASH', 'BOND');
  update holdings set exposure_region = null
    where asset_type = 'ETF'
      and (name ~ '국고채|국채|채권|Treasury' or name ~ '금속|광산|희소금속|희토류|원자재|골드|은 ETF');
  ```
  이 사용자의 53개 종목에 적용하면 `기타` 8개(SGOV, KODEX 국고채10년, 개별채권, 정기예금, 파킹통장, REMX, PICK, SIVR), 나머지는 한국/미국으로 정확히 갈린다 — 검증함. NLR(우라늄)·ICLN(클린에너지)은 규칙상 `미국`(주식형)이며, 사용자가 원자재로 보고 싶으면 UI에서 `기타`로 바꾼다.
- **입력 UI**: `ExecutionFormDialog`의 "+ 새 종목" 흐름(지역·계좌 줄 근처)과 `/holdings`의 `HoldingFormDialog`. 선택지 `한국 / 미국 / 기타(국가 무관)`. 기본값은 위 규칙으로 파생.

### 축 ② 자산군 (현행 유지)

- `bucketOf = group_id`, `targetOf = asset_groups.target_pct`. **코드·UI 변경 없음.** 지금 `/portfolio`가 보여주는 그대로가 이 축이다.

### 축 ③ 변동성 (공격 / 중립 / 방어)

- **버킷 기준**: 종목별 **연율 변동성(σ)** 절대 임계값.
  - 기본값 `< 12% 방어 / 12–25% 중립 / > 25% 공격`. **임계값과 lookback 기간은 설정값으로 노출**한다(위 Context대로 국면에 민감하므로). 기본 lookback은 길게 잡는다(2~3년) — 국내 지수가 최근 국면 때문에 통째로 "공격"에 몰리는 왜곡을 줄이기 위해.
  - 상대 백분위·베타 기준도 검토했으나 절대 임계값을 택함(직관적이고 다른 사람과 비교 가능). 국면 민감성은 lookback을 길게 + 설정 노출로 완화한다.
  - **`방어`로 확정(σ 계산 안 함)**: `asset_type IN ('CASH', 'BOND')` — 예수금·파킹통장·개별채권. 시세 자체가 없고 만기보유·원리금 성격이라 변동성이 사실상 0. 시장 축의 `기타`와는 별개 축이므로, 예컨대 국고채 ETF는 시장 축에서 `기타`, 변동성 축에서 `방어`로 각각 잡힌다.
  - **"측정 불가"(버킷 미배정)** — 아래 중 하나면 임의로 중립에 넣지 않고 별도 표시한다(등락률에서 조회 실패와 0%를 안 섞는 기존 원칙과 동일):
    1. `ticker` 있는데 Toss 캔들 이력이 최소 거래일수(예: 60일) 미만 — 신규 상장 ETF/ETN 등(POC에서 `530011` 신한 인버스 200 ETN이 여기 해당).
    2. `ticker` 있는데 Toss 조회가 실패(`stock-not-found`, 레이트리밋 재시도 소진, 파싱 실패). 일시적 실패는 재조회로 풀리지만, 이번 렌더에서 못 구했으면 0%가 아니라 "측정 불가".
    3. `ticker = null`이면서 `asset_type`이 CASH/BOND가 **아닌** 경우 — 시세 피드가 없어 σ를 못 구하는데 실제로는 시장 위험이 있는 자산(예: `삼성 배당주 자문형 펀드`, `asset_type='FUND'`). "현금성이니 방어"로 가정하면 거짓이 되므로 측정 불가로 둔다.
    4. 해외 종목인데 해당 lookback 구간의 과거 USD/KRW 환율(`fx_rate_daily`/Frankfurter)을 못 채운 경우 — 드물다. native σ로 폴백할 수도 있으나 KRW 기준 일관성을 위해 측정 불가로.
  - **목표합 100% 기준**: 측정 불가 종목의 평가금은 분모에서 뺀다 — 목표%·실제%·조정금 모두 **측정 가능분을 100%로 정규화**해서 계산하고, 측정 불가 비중은 버킷 리스트 위에 별도 안내줄(`측정 불가: X% (N종목)`)로만 보여준다. 별도 4번째 버킷으로 만들지 않는다(목표를 설정할 수 있는 대상이 아니므로).
- **부가 뷰**: 사용자의 자산군(②)을 그룹별 평균 σ로 정렬해 "어느 전략 그룹이 변동성이 큰가"를 같이 보여준다.
- **목표% 저장**: `axis_targets`에 `axis='volatility'`로 3행.

### 신규 인프라

1. **`axis_targets` 테이블** — ①③의 버킷별 목표%.
   ```sql
   create table axis_targets (
     user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
     axis text not null check (axis in ('market', 'volatility')),
     bucket text not null,
     target_pct numeric not null default 0 check (target_pct between 0 and 100),
     primary key (user_id, axis, bucket)
   );
   ```
   (②는 `asset_groups.target_pct`를 그대로 쓰므로 이 테이블에 안 들어간다.) `bucket`은 축별로 `market` → `한국`/`미국`/`기타`, `volatility` → `공격`/`중립`/`방어`. `null(기타)` 종목은 `bucket = '기타'` 행으로 집계한다.

2. **`tossHistoryProvider`** (`lib/toss/`) — 한 심볼의 일봉을 `count=200` + `before` 커서로 페이지네이션해 원하는 기간만큼 받는다. `tossCandleProvider`의 창(window) 레이트리밋 처리를 재사용하되, 페이지네이션으로 호출 수가 늘어나므로 창 크기를 재조정한다(초당 20건 한도 안에서).

3. **`price_daily(symbol, date, close)` read-through 캐시 테이블** — 과거 확정 일봉 종가.
   - **ADR-0004("현재가는 저장하지 않는다")를 뒤집는 게 아니다.** ADR-0004는 *현재가*에 대한 규칙이고, 현재가·평가금액 계산은 지금처럼 `useLivePrices`로 매번 라이브 조회한다(변경 없음). 이 캐시는 **한 번 확정되면 안 바뀌는 과거 종가**만 담으며, 이는 ADR-0055의 `fx_rate_daily`(과거 확정 환율)와 정확히 같은 성격이다 — 유저 스코핑 없는 전역 참조 데이터, 조회 시점에 빈 날짜만 채우고, `on conflict do nothing`.
   - 오늘 날짜의 (아직 확정 안 된) 종가는 캐시하지 않는다.

4. **`useRiskMetrics` 훅** — 보유 종목들의 일간수익률 시계열을 받아 종목별 σ/베타/MDD와 공분산 행렬 기반 포트폴리오 σ를 계산한다. 해외 종목은 Frankfurter 과거 환율(`useHistoricalFxRates`, ADR-0055)로 KRW 환산한 뒤 수익률을 낸다. 순수 함수로 분리(`lib/calc/risk.ts`), 훅은 쿼리·조립만.

5. **`/portfolio` 3축 탭 UI** — 아래 별도 절.

### `/portfolio` UI 구조

**탭(축 전환)은 plain 세그먼트 버튼**으로 만든다 — `/holdings`의 목록/히트맵, `/journal`의 기간/종목과 같은 패턴(ADR-0051). Tabs 프리미티브는 도입하지 않는다. 순서: `자산군`(기본) · `시장` · `변동성`.

- **탭 상태는 URL 쿼리 `?axis=group|market|volatility`** — 딥링크·새로고침에 유지. 없으면 `group`.
- **탭은 "보는 축"만 바꾼다. 편집 모드와 draft는 페이지 전역 하나.** `수정`/`취소`/`완료` 버튼은 탭 바깥(페이지 헤더)에 그대로. 편집 중 탭을 오가며 세 축의 목표를 모두 고치고 한 번의 `완료`로 커밋한다.

**자산군 탭** = 현행 `/portfolio` 그대로(donut ×2 + `GroupCard` 리스트 / 편집 시 `EditGroupCard` + dnd + `+ 자산군 추가`). 코드 변경 없음. `DndContext`는 이 탭에만 존재한다.

**시장 탭 / 변동성 탭** — 구조 동일:
- 상단 donut ×2 (목표 / 실제), 버킷 keyed(3슬라이스). `AllocationDonutChart` 재사용, hover 동기화.
- 버킷 행 리스트 — `GroupCard` 접힌 행과 같은 비주얼(버킷명 · 목표% · 실제% · 차이 `diffColor` · 조정금 mango 고정색). 편집 모드에선 목표% 칸이 `useEditableNumberField` 입력.
- 버킷 펼침 → 소속 종목 **읽기 전용** 리스트(티커/이름/계좌/평가금/버킷내 비중; 변동성 탭은 σ 열 추가). dnd·CRUD 없음 — σ·상장국은 드래그로 바꿀 수 없다. `GroupHoldingsPanel`의 읽기 부분만 발췌한 경량 컴포넌트.
- **변동성 탭 전용**: 상단에 `최근 N년 · 방어<12 중립<25` 뱃지 + 설정 팝오버(lookback·임계값), `측정 불가: X% (N종목)` 안내줄 + 접이식 리스트, 하단에 자산군별 평균 σ 정렬 막대뷰.

**draft 확장** (`lib/portfolioDraft.ts`):
```ts
type PortfolioDraft = {
  groups: DraftGroup[];       // 기존
  holdings: DraftHolding[];   // 기존
  axisTargets: {              // 신규
    market:     Record<'한국' | '미국' | '기타', number>;
    volatility: Record<'공격' | '중립' | '방어', number>;
  };
};
```
`commitPortfolioDraft`가 `axis_targets` diff(upsert/delete)도 처리한다. `취소`는 세 축 목표 편집을 전부 폐기(기존 draft 규칙). `exposure_region` 자체 편집은 이 화면 아님 — `/holdings`·매매일지 새 종목 흐름(ADR-0058 축 ①).

**완료 가드**: 축마다 목표합 100% 독립 검사. 변동성 축은 **측정 가능분** 기준 100%(측정 불가 비중은 분모에서 제외). 완료 버튼 옆 경고에 어느 축이 몇 %인지 표시.

## Consequences

- 비중 체크가 자산군 하나 → 세 축이 된다. ②는 그대로라 회귀 위험이 낮다.
- **새 외부 데이터 의존 없음** — 지수 데이터·섹터 분류·펀더멘털 없이, 이미 쓰는 Toss 캔들 + Frankfurter만으로 세 축이 다 계산된다. 벤치마크는 ETF 대용(`069500`/`VOO`)이라 베타는 근사치다.
- `price_daily` 캐시가 생긴다 — DB에 시세성 데이터가 들어가는 두 번째 사례(첫째는 `fx_rate_daily`). "라이브 현재가는 저장 안 함" 원칙은 유지되지만, "과거 확정값은 캐시 OK"라는 선이 한 번 더 그어진다. 스키마 주석과 AGENTS.md에 이 구분을 명시해야 한다.
- 변동성 축의 절대 임계값은 시장 국면에 따라 버킷 분포가 크게 흔들린다 — lookback을 길게 잡고 설정으로 노출해도, 사용자가 숫자를 그대로 두면 "최근 6개월 기준 전부 공격" 같은 화면이 나올 수 있다. 화면에 lookback 기간을 항상 표기해야 한다.
- 캔들 페이지네이션 + 레이트리밋(20/초) 때문에 보유 종목이 많으면(50+) 첫 로딩에 수 초가 걸린다 — `price_daily` 캐시가 채워진 뒤로는 대부분 DB 조회로 끝난다. `useRiskMetrics`는 `enabled` prop으로 비중 체크 화면에서 변동성 축을 볼 때만 조회를 켠다(`useDailyReturns` 패턴).
- `exposure_region`이 `region`과 별개 컬럼이 되면서 "지역"이라는 말이 두 가지(상장 vs 실질)를 뜻하게 된다 — 코드/문서에서 혼동 주의. `region`은 통화·거래소(non-null), `exposure_region`은 시장 축 전용(nullable, null=기타).
- 시장 축은 3버킷(한국/미국/기타)이지만 `기타`는 국가 개념이 아니라 "국가 무관"의 묶음이라, 목표 설정은 사실상 "한국 주식 몇 % / 미국 주식 몇 % / 나머지(현금·채권·원자재) 몇 %"가 된다. 일본·중국·인도 등 실제 국가를 늘리면 `exposure_region` enum·마이그레이션·`axis_targets` 행이 함께 늘어난다 — `기타`는 그대로 둔다.
- 원자재/채권/현금의 `exposure_region = null`은 "시장 축에서 빠진다"는 뜻이지 "익스포저 정보 없음"이 아니다 — 입력 UI에서 `기타(국가 무관)`를 명시적으로 고를 수 있어야 하고, "아직 분류 안 함"과 구분이 안 되는 문제가 있다(둘 다 DB에선 null). 신규 종목은 위 파생 규칙으로 항상 셋 중 하나가 정해지므로 실무상 "미분류 null"은 안 생기지만, 규칙이 못 맞히는 종목이 오면 UI에서 사용자가 정하기 전까지 `기타`로 보인다.
