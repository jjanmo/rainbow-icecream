# ADR-0014: 설정 페이지에서 종목 수정도 전체 항목을 편집 가능하도록 확장

## Status
Superseded by [ADR-0015](./0015-setup-accordion-and-dnd-reorder.md) — the modal-based edit here felt awkward while already inside the page's edit mode; replaced with an inline accordion.

## Context
ADR-0013에서 설정 페이지의 "+ 종목 추가"는 `HoldingFormDialog`를 재사용해 전체 항목(자산군/티커/종목명/구분/계좌/보유수량/평균매입가/비고)을 입력받도록 바뀌었다. 그런데 이미 등록된 종목을 "수정"할 때는 여전히 인라인 행(`EditHoldingInlineRow`)에서 티커/종목명/그룹 내 비중만 고칠 수 있고, 보유수량·평균매입가 등은 보유 종목 페이지로 가야만 고칠 수 있었다 — 추가와 수정의 편집 범위가 서로 달라 일관성이 없었다.

## Decision
`EditHoldingInlineRow`에서 티커/종목명 인라인 입력을 제거하고 읽기 전용으로 표시하며, 그룹 내 비중만 인라인으로 유지한다. 새로 추가한 연필(수정) 아이콘을 누르면 `HoldingFormDialog`가 해당 종목의 현재 draft 값으로 채워진 채 열려서, 자산군 재배정을 포함한 전체 항목을 고칠 수 있다. 그룹 내 비중은 이 모달에 없으므로 여전히 인라인 행에서만 조정한다.

이를 위해 `HoldingFormDialog`의 `initialHolding` prop 타입을 `Holding`에서 `NewHolding`으로 좁혔다 — 다이얼로그가 실제로 쓰는 필드는 애초에 `NewHolding`의 필드뿐이었고, 이러면 `id`/`userId`/`createdAt`이 없는 `DraftHolding`도 (`draftHoldingToNewHolding`으로 변환해서) 그대로 넘길 수 있다. `lib/setupDraft.ts`에 `draftHoldingToNewHolding`(다이얼로그에 채워줄 초기값 변환)과 `applyFormToDraftHolding`(제출값을 기존 draft에 clientKey/id 유지한 채 반영)을 추가했다.

## Consequences
- 설정 페이지 안에서 종목의 모든 정보(그룹 재배정 포함)를 완결적으로 관리할 수 있어, 추가/수정 편집 범위가 통일됐다.
- `HoldingFormDialog`가 보유 종목 페이지와 설정 페이지 양쪽에서 재사용되므로, 이 다이얼로그를 고칠 때는 두 화면 모두에 영향을 미친다는 점을 염두에 둬야 한다.
- 설정 페이지에서 자산군을 바꾸면 해당 종목이 그 즉시 다른 그룹 카드로 옮겨 보인다(같은 draftHoldings 배열을 `groupClientKey`로 필터링해서 렌더링하기 때문) — 별도 이동 로직은 필요 없다.
