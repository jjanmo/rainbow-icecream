# ADR-0040: 종목별 색상을 없앤다

## Status
Accepted (ADR-0025를 대체)

## Context

종목마다 자산군 hue의 tint를 매겨 구분하려던 기능(ADR-0025, `computeRebalance`의
`colorSlotById` + `lib/setupDraft.ts`의 `draftColorSlots`)이 있었지만, 실제로
쓰이는 곳을 확인해보니 설정 페이지 편집 모드의 접힌 종목 요약 줄
(`EditHoldingInlineRow`) 옆 작은 점 하나뿐이었다 — 읽기 모드의 자산군 펼침
패널(`GroupHoldingsPanel`)은 애초에 이 값을 쓰지 않고 자기가 보여주는 목록
순서로 그때그때 독립적으로 색을 나눠 쓰고 있었고, 보유종목 페이지에는 종목별
색 점 자체가 없었다.

이 정도 효과로는 "종목을 색으로 명시적으로 구분한다"는 원래 목적을 달성하지
못한다고 판단해 기능 자체를 버리기로 했었는데, `colorSlotById`/
`draftColorSlots`가 코드에는 레거시로 남아있었다. 게다가 이 로직은 "자산군
안의 종목 개수(`total`)가 바뀌면 남은 종목들의 색도 함께 바뀐다"는 부작용을
이미 ADR-0025 스스로도 인지하고 있었고(종목 삭제 시), 앞으로 0주 종목을 조회에서
걸러내는 방향을 검토하면서 이 부작용이 발생하는 경우가 하나 더 늘어날 상황이었다.

## Decision

- 종목별 색(`HoldingCalc.color`, `tintForIndex`, `colorSlotById`,
  `draftColorSlots`)을 전부 제거한다. `EditHoldingInlineRow`의 색 점도 없앤다.
- `DraftHolding.createdAt`도 함께 제거한다 — `draftColorSlots`가 유일한
  소비처였다.
- **자산군 색(`GroupCalc.color`/`hueForGroupIndex`)은 그대로 유지한다** — 이건
  여전히 여러 화면(설정 페이지 그룹 카드, 보유종목 테이블의 자산군 점, 비중
  체크 테이블)에서 실제로 종목이 어느 자산군 소속인지 구분하는 데 쓰인다.
- `GroupHoldingsPanel`이 자체적으로 계산하는 독립 배색(그때그때 표시 순서
  기준으로 균등 분배)은 건드리지 않는다 — 이미 종목별 색과 무관하게 동작하고
  있었다.

## Consequences

- 코드가 단순해진다 — 순서를 두 가지(표시 순서/색상 순서)로 나눠 관리하던
  로직, draft holding에 `createdAt`을 실어 나르던 배관이 사라진다.
- 종목 목록에서 자산군 소속은 여전히 색으로 구분되지만(그룹 색), 같은 자산군
  안의 개별 종목끼리는 더 이상 색으로 구분되지 않는다 — 티커/종목명 텍스트로
  구분한다.
- 종목 목록에 0주(청산된) 종목을 조회 단계에서 걸러내더라도, 더 이상 다른
  종목의 색이 흔들리는 부작용이 없다 — 애초에 종목별 색이라는 개념이 없으므로.
