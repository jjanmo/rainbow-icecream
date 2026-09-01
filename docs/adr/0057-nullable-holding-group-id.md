# ADR-0057: 소프트 삭제된 종목의 group_id를 null로 비운다

## Status
Accepted — `group_id` nullable은 유지되나, "null = 소프트 삭제된 종목 전용"이라는
좁힌 의미는 ADR-0059가 "어느 자산군에도 속하지 않음"(활성 종목 포함)으로 일반화함.

## Context

`holdings.group_id`는 `not null` + `on delete restrict`였다. 자산군을 삭제하면 `lib/api/groups.ts`의 `deleteGroup`이 그 그룹의 홀딩을 전부 "미분류" 자산군으로 재배정한 뒤에야 삭제했다(ADR-0035) — FK가 재배정 없는 삭제를 막기 때문이다.

문제는 이 재배정 대상 조회(`select id from holdings where group_id = :id`)가 `deleted_at`을 걸러내지 않았다는 것이다. 소프트 삭제된(ADR-0045) 홀딩도 `group_id`는 여전히 그 그룹을 가리키고 있으니, 살아있는 홀딩과 똑같이 "재배정이 필요한 멤버"로 잡혔다.

실제로 재현된 시나리오: 기초잔고(OPENING_BALANCE) 하나만 있던 VOO 홀딩을 그 기초잔고 삭제로 소프트 삭제(ADR-0054 캐스케이드)한 뒤, VOO가 속해있던 자산군을 삭제했다. `deleteGroup`이 소프트 삭제된 VOO를 "멤버가 있다"고 오판해 "미분류" 자산군을 새로 만들어 VOO를 거기로 옮겼다. 이후 사용자가 필요없는 "미분류"를 지우려 하자, 그 안에 낀 죽은 VOO가 또 "멤버"로 잡혀 **"미분류" 자신을 대신할 새 "미분류"를 또 만들어냈다** — 지워도 지워도 자동으로 재생성되는 것처럼 보였다.

## Decision

**살아있지 않은(soft-delete된) 홀딩은 어떤 실제 그룹으로도 재배정하지 않고, `group_id`를 `null`로 비운다.**

처음엔 "미분류" 대신 이미 존재하는 아무 다른 그룹으로 보내는 방안도 검토했다(무한 재생성만은 막을 수 있었다) — 하지만 그건 근본적으로 거짓 데이터다: 그 홀딩은 실제로 그 그룹에 속한 적이 없는데도 계속 어딘가를 가리키게 되고, 나중에 "이 종목이 예전에 어느 그룹이었는지" 같은 기능이 생기면 조용히 틀린 값을 보여주게 된다. 소프트 삭제된 홀딩의 진실은 "어느 그룹인지 알 수 없다"가 아니라 "그룹이라는 개념 자체가 더 이상 의미없다"는 것이므로, `null`이 그 진실을 있는 그대로 표현한다.

- `holdings.group_id`를 nullable로 바꾸고(`alter table holdings alter column group_id drop not null`), "own holdings" RLS 정책도 `group_id is null or group_id in (...)`로 완화했다.
- `deleteGroup`은 이제 멤버를 `deleted_at`으로 나눠서 처리한다 — 활성 멤버는 기존처럼 "미분류"로(find-or-create), 소프트 삭제된 멤버는 `clearHoldingGroup`(`lib/api/holdings.ts`)으로 `group_id`만 null로 지운다.
- `Holding.groupId: string | null`로, `NewHolding.groupId`는 `Omit<Holding, "groupId"> & { groupId: string }`로 다시 non-null로 좁혔다 — 홀딩을 새로 만들 때는 항상 실제 그룹이 있어야 하기 때문이다.
- `Holding.groupId`를 읽는 나머지 소비처(`lib/calc/rebalance.ts`, `lib/portfolioDraft.ts`, `HoldingsHeatmap.tsx`)는 전부 활성 홀딩만 다루는 `fetchHoldings`/`useHoldings` 경로라 실제로 null을 만날 일이 없다 — `if (groupId)` 분기를 추가하는 대신 `!` 단언 + 주석으로 처리했다(일어날 수 없는 경우를 방어 코드로 감싸지 않는다는 기존 원칙과 일관).

**타이밍**: 데이터·코드가 아직 작을 때(1인용 앱, `.groupId` 참조 8개 파일 25곳) 마이그레이션하는 게, 나중에 참조가 훨씬 늘어난 뒤에 하는 것보다 훨씬 싸다고 판단해 지금 진행했다.

## Consequences
- "미분류"가 소프트 삭제된 홀딩 때문에 지워도 다시 생기는 문제가 사라졌다 — 재생성 조건이 "정말 보존해야 할 활성 홀딩이 있을 때"로 좁혀졌다.
- 소프트 삭제된 홀딩의 `group_id`가 이제 실제로 정확한 정보(있으면 진짜 마지막 그룹, 없으면 그 그룹도 이미 삭제됨)만 담는다.
- 이미 존재하던 오염 데이터(VOO 홀딩의 `group_id`가 "미분류"를 가리키던 것, 그리고 그 "미분류" 자산군 자체)는 이번에 직접 정리했다 — VOO는 `group_id = null`로, 빈 "미분류"는 삭제.
- `Holding.groupId`가 nullable이 되면서 그걸 읽는 코드마다 "이 경로는 활성 홀딩만 다루니 null이 아니다"라는 암묵적 전제가 생겼다 — 새로 `Holding.groupId`를 읽는 코드를 추가할 때는 그 데이터가 `fetchHoldings`(활성만)에서 왔는지 `fetchAllHoldings`(전체)에서 왔는지 먼저 확인해야 한다.
