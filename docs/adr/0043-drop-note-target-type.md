# ADR-0043: trade_notes의 target_type/target_key를 없애고 execution_id FK로 교체

## Status
Accepted

## Context

ADR-0041에서 근거 타겟팅을 EXECUTION 하나로 통일하기로 했지만, `target_type`/`target_key` 컬럼(POSITION/DAY 값을 포함하는 열거형 + 느슨한 text 키)은 그대로 남겨뒀다 — "과거 데이터·향후 확장을 위해." 실제로 확인해보니:

- `POSITION`은 ADR-0041 이후로 아무 코드도 쓰지 않는다 — 완전히 죽은 갈래.
- `DAY`는 애초에 쓰인 적이 없다 (ADR-0033에서부터 스캐폴딩만 있었다).
- 기존 데이터에 `POSITION` 노트 2건이 실제로 있었다 — 둘 다 의미 있는 투자 근거 메모(예: "1년 정도 들고갈 예정")였는데, ADR-0041 이후로는 `target_type === 'EXECUTION'`만 조회하니 앱 어디에도 안 보이는 상태였다. 이걸 발견하지 못했다면 사용자가 적어둔 내용이 조용히 유실될 뻔했다.

## Decision

**기존 POSITION 노트를 먼저 구제한다.** 각 노트가 가리키던 종목(`target_key` = holdingId)의 가장 이른 체결을 찾아, 그 체결의 EXECUTION 노트로 옮긴다 — 내용은 그대로, 다시 매매일지에서 보이게 된다.

**`target_type`/`target_key`를 없애고 `execution_id uuid references executions(id)`로 바꾼다.** 이제 노트는 항상 체결 하나에 붙으므로, 느슨한 `(target_type, target_key)` 조합 대신 실제 FK 하나면 충분하다. 유니크 인덱스도 `(user_id, target_type, target_key)`에서 `(execution_id)` 하나로 단순화한다 — `execution_id`가 이미 특정 사용자의 체결을 고유하게 가리키므로 `user_id`를 더할 필요가 없다.

**RLS도 `executions`와 같은 패턴으로 강화한다.** `own trade notes` 정책에 "이 `execution_id`가 실제로 내 체결을 가리키는가"라는 `with check`를 추가했다 — `own executions`가 holding 소유권을 검사하는 것과 같은 이유다.

## Consequences

- `lib/journal/noteTarget.ts`가 통째로 사라졌다 — `executionNoteKey`가 사실상 항등함수였는데, 이제 호출부(`journal.tsx`)가 `execution.id`를 직접 쓴다.
- `NoteTargetType` 타입, `TradeNote.targetType`/`targetKey` 필드가 사라지고 `TradeNote.executionId`로 대체됐다.
- 이 결정으로 POSITION/DAY 타겟팅이라는 "나중에 확장할 수도 있는" 여지 자체가 없어진다 — 나중에 종목 단위 노트나 날짜 단위 노트가 필요해지면 새 테이블이나 컬럼을 다시 만들어야 한다. 지금 안 쓰는 유연성을 스키마에 남겨두는 것보다, 필요할 때 다시 설계하는 쪽을 택했다(이 프로젝트의 반복된 선택 — ADR-0034/0038/0041/0042와 같은 결).
