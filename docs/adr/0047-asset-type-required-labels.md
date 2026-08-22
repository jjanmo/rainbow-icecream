# ADR-0047: 자산종류를 필수값으로, 표기·라벨 다듬기

## Status
Partially superseded by [ADR-0050](./0050-opening-balance-new-holding-only.md) — "매매일지의 새 종목 흐름은 자산종류를 안 물어보고 기본값 ETF로 만든다"는 부분이 뒤집혔다(이제 그 흐름에서도 자산종류를 직접 고른다). 필수값·라벨 자체는 그대로다.

## Context

ADR-0046에서 `assetType`을 선택 입력으로 도입했는데, 실제로 써보니 굳이 선택으로 남겨둘 이유가 없었다 — 필수로 만들고 기존 종목엔 합리적인 기본값을 채우는 편이 낫다는 판단. 또한 화면에 노출되는 이름("자산타입")과 STOCK의 라벨("주식")이 다른 개념과 헷갈릴 여지가 있었다: ETF·ETN·REIT·FUND도 넓게 보면 "주식시장에서 거래되는 상품"이라, "주식"이라는 라벨이 유독 STOCK만 가리키는 게 명확하지 않았다.

## Decision

**변수명(`assetType`)은 유지하고, 화면 표기만 "자산종류"로 바꾼다.** 코드 전반의 식별자를 바꾸는 것보다 UI 라벨만 조정하는 쪽이 변경 범위가 작다.

**라벨을 다듬는다** — 특히 STOCK을 "주식"이 아니라 "개별 주식"으로 바꿔서 ETF/ETN 같은 다른 상장 상품과 명확히 구분한다:

| 값 | 라벨 |
|---|---|
| STOCK | 개별 주식 |
| ETF | ETF |
| ETN | ETN |
| REIT | 리츠 |
| FUND | 일반 펀드 |
| BOND | 채권 |
| CASH | 예수금 |

**필수값으로 바꾼다.** DB에 `not null default 'ETF'` 제약을 걸고, 기존 종목(전부 44개) 전부 `ETF`로 채웠다 — 실제 포트폴리오 대부분이 ETF라 사용자가 확인한 합리적인 기본값이다. `HoldingFormDialog`도 항상 값이 채워진 채로 열리므로(빈 선택지 없음), `NewHolding.assetType`은 이제 `AssetType`(non-null) 타입이다. 매매일지의 "새 종목" 흐름도 자산종류를 안 물어보므로 똑같이 `'ETF'`로 만들고, 나중에 보유종목 화면에서 고칠 수 있게 남겨뒀다.

**테이블 열 순서를 종목 → 자산군 → 자산종류 → (나머지 그대로)로 바꾼다.** 두 분류 개념이 나란히 붙어 있어야 서로 비교하기 쉽다.

## Consequences

- `holdings.asset_type`에 NOT NULL 제약이 걸려서, 앞으로 이 컬럼을 다루는 모든 insert/update 경로가 항상 유효한 값을 보내야 한다 — 현재는 `HoldingFormDialog`(사용자 선택)와 매매일지 새 종목 흐름(`'ETF'` 고정값) 두 곳뿐이라 문제없다.
- `HoldingsTableRow`의 열 순서가 바뀌면서 `HoldingsTable`의 `TableFooter` 빈 셀 개수도 같이 맞춰야 했다 — 순서가 안 맞으면 합계 행이 엉뚱한 열 아래에 나타난다.
