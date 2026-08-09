# ADR-0015: 설정 페이지 종목 수정을 아코디언으로, dnd-kit으로 그룹 내 순서 변경

## Status
Accepted

## Context
ADR-0014에서 종목 수정은 `HoldingFormDialog`를 다시 열어서 처리했는데, 이미 페이지 전체가 "수정" 모드에 들어가 있는 상태에서 종목 하나를 고치려고 또 모달을 여는 흐름이 어색하다는 피드백을 받았다. 추가로, 종목을 원하는 순서로 배치하고 싶다는 요구도 있었다.

## Decision
- `EditHoldingInlineRow`를 아코디언으로 바꿨다 — 접힌 상태는 기존처럼 티커/종목명(읽기전용)과 그룹 내 비중(인라인 편집)만 보여주고, 화살표를 누르면 자산군/티커/종목명/구분/계좌/보유수량/평균매입가/비고 전체를 펼쳐서 편집할 수 있다. 모달 없이 각 필드가 draft 상태에 직접 바인딩된다(이미 있는 그룹 내 비중 인라인 편집과 동일한 패턴) — 별도의 "저장" 버튼이 없다, 이미 페이지 전체가 draft/staging이라 이중으로 커밋 단계를 둘 필요가 없다.
- `dnd-kit`(`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)을 추가해 같은 자산군 카드 안에서 종목을 드래그로 재정렬할 수 있게 했다. **자산군 간 이동은 드래그로 지원하지 않는다** — 필요하면 아코디언의 자산군 드롭다운으로 재배정한다.
- 순서를 실제로 저장하기 위해 이미 스키마에는 있었지만 앱 코드에서 한 번도 쓰이지 않았던 `holdings.sort_order` 컬럼을 도메인 타입(`Holding.sortOrder`)과 API 계층에 연결했다. `computeRebalance`의 정렬은 `createdAt` 우선에서 `sortOrder` 우선(동률이면 `createdAt`)으로 바뀌었다 — 기존 데이터는 전부 `sort_order = 0`이라 실질적으로 기존과 동일한 순서를 유지하다가, 사용자가 드래그하는 순간부터 명시적인 순서를 갖는다.
- `EditGroupCard`가 자산군 목록(`groupOptions`)을 받아 각 `EditHoldingInlineRow`의 자산군 드롭다운에 전달한다.

## Consequences
- 종목 추가는 여전히 모달(`HoldingFormDialog`)을 쓴다 — 사용자가 불편함을 느낀 지점은 수정이었고, 추가는 "새로 만드는" 동작이라 모달이 자연스럽다고 판단해 그대로 뒀다.
- `lib/api/holdings.ts`의 정렬 쿼리(`order("sort_order")` → `order("created_at")`)와 `lib/calc/rebalance.ts`의 비교 함수가 함께 바뀌어야 순서가 어긋나지 않는다 — 둘 중 하나만 고치면 화면과 실제 저장 순서가 달라질 수 있다.
- 종목을 드래그로 재정렬해도 "완료"를 누르기 전까지는 서버에 반영되지 않는다(draft 원칙 그대로 유지) — `commitSetupDraft`가 `sortOrder`가 바뀐 종목만 `updateHolding`으로 반영한다.
