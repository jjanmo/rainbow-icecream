# ADR-0046: 자산타입 필드 추가, 비고(메모) 필드 제거

## Status
Partially superseded by [ADR-0047](./0047-asset-type-required-labels.md) — 선택 입력이었던 자산타입은 필수값(기본 ETF)으로 바뀌었고, 화면 표기도 "자산종류"로, STOCK 라벨도 "개별 주식"으로 바뀌었다. 값 목록 자체는 [ADR-0061](./0061-asset-type-account-option-revision.md)에서 REIT 제거·GOLD 추가로 다시 바뀌었다. 비고(메모) 제거는 그대로 유지된다.

## Context

종목에 "이 종목이 무슨 상품인지"(주식/ETF/ETN/리츠/펀드/채권/현금)를 기록할 방법이 없었다. 자산군은 사용자가 세운 전략에 따른 그룹(예: "성장주")이라 상품 자체의 분류와는 다른 개념인데, 이름이 비슷해 헷갈리기 쉽다. 한편 "비고" 자유 서술 필드는 실제로 쓰이지 않고 있었다.

## Decision

**`assetType`을 추가한다.** `'STOCK' | 'ETF' | 'ETN' | 'REIT' | 'FUND' | 'BOND' | 'CASH'` 고정 열거형이고, 기존 종목은 비어있는 채로 시작한다 — 필수로 만들면 기존 40여 개 종목을 전부 분류하기 전엔 사소한 이름 수정조차 막히므로, **선택 입력으로 뒀다**. `HoldingFormDialog`(보유종목 화면의 종목 추가/수정)에 자산군 옆에 나란히 넣고, "?" 팝오버로 자산타입과 자산군의 차이를 설명한다(`/rebalance` 리밸런싱 헤더의 "?" 설명, 매매일지 기초잔고 배지 설명과 같은 클릭 토글 Popover 패턴).

매매일지의 "+ 새 종목"에는 넣지 않았다 — 그쪽은 매수·매도라는 행위 자체에 집중한 폼이고, 자산타입 같은 종목 메타데이터는 보유종목 화면에서 나중에 채워도 된다.

**`memo`(비고)를 없앤다.** 실사용 데이터가 비어있어 기존 값 손실 우려 없이 컬럼째 지웠다 — `holdings.memo` DB 컬럼, `Holding`/`NewHolding`/`DraftHolding` 타입, `HoldingFormDialog`의 입력, `HoldingsTable`의 비고 열을 전부 없앴다. 비고 열이 있던 자리에 자산타입 열을 넣었다.

## Consequences

- `HoldingsTable`의 마지막 정보 열이 "비고"에서 "자산타입"으로 바뀌었다 — 정렬 가능(`SortableKey`에 추가).
- `lib/setupDraft.ts`의 안 쓰이던 `draftHoldingFromForm` 함수를 이 김에 지웠다 — ADR-0036 이후로 호출하는 곳이 없었다(grep으로 확인).
- `assetType`이 선택 입력이라 기존 종목은 계속 비어있을 수 있다 — 강제 백필은 하지 않았다.
