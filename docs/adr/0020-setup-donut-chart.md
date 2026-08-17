# ADR-0020: 설정 페이지 상단을 바 차트에서 도넛 차트로 교체

## Status
Accepted

## Context
설정 페이지 상단의 "목표 배분"/"실제 보유 비중" 두 지표(ADR-0013)는 가로 바 차트(`AllocationBar`)로 표시돼 있었다. 비중 체크 페이지는 같은 성격의 자산군별 비중 비교를 이미 도넛 차트(`AllocationDonutChart`)로 보여주고 있었는데, 설정 페이지만 다른 차트 형태를 쓰고 있어 앱 전체의 시각 언어가 일관되지 않았다.

## Decision
설정 페이지 상단의 두 `AllocationBar`를 비중 체크 페이지와 동일한 `AllocationDonutChart`로 교체했다. 컴포넌트를 `components/rebalance/`에서 `components/shared/`로 옮겨 두 페이지가 공유하도록 했다. 기존에 각 지표 위에 있던 상태 배지("정상"/"100%보다 X% 초과" 등)는 도넛 차트의 `title` 영역에 그대로 끼워 넣었다 — 이를 위해 `title` prop 타입을 `string`에서 `ReactNode`로 넓혔다.

이제 쓰이지 않는 `AllocationBar` 컴포넌트는 삭제했다.

## Consequences
- 설정 페이지와 비중 체크 페이지가 완전히 같은 도넛 차트 컴포넌트(호버/클릭 인터랙션 포함)를 쓰게 되어 시각적 일관성이 생겼고, 유지보수 지점도 하나로 줄었다.
- `AllocationDonutChart`를 고치면 두 페이지 모두에 영향을 준다는 점을 염두에 둬야 한다.
- 도넛 차트는 바 차트보다 카드 하나당 차지하는 세로 공간이 크다 — 페이지가 좀 더 길어진다.
