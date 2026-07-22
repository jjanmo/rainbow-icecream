# ADR-0009: 숫자 입력은 `type="number"` 대신 문자열 초안 상태로 처리

## Status
Accepted

## Context
`<input type="number">`를 숫자 state에 직접 바인딩하고 매 키입력마다 `Number(e.target.value)`로 변환하면, 0으로 초기화된 필드에 "10"을 입력할 때 "010"이 되는 등 타이핑이 깨지는 문제가 있었다. 이 문제는 보유수량 입력뿐 아니라 설정 페이지의 비중(%) 입력에서도 동일하게 발생했다.

## Decision
모든 숫자 입력(수량, 평균매입가, 비중 %)은 `type="text"` + `inputMode="decimal"`을 쓰고, 로컬 문자열 초안 상태를 유지하다가 blur/submit 시점에만 숫자로 파싱한다. 이 패턴을 `useEditableField`/`useEditableNumberField` 훅으로 표준화해서 재사용한다.

## Consequences
- 새로운 숫자 입력 필드를 추가할 때마다 직접 구현하지 않고 이 훅을 재사용해야 한다.
- `type="number"`를 쓰지 않으므로 브라우저 기본 숫자 검증(스피너, 범위 제한 등)은 포기한다 — 검증은 파싱 시점에 직접 처리한다.
