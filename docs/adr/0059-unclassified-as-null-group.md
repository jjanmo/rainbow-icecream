# ADR-0059: "미분류"를 실제 그룹 row가 아니라 `group_id = null`로 표현한다

## Status

Accepted

## Context

ADR-0035는 "자산군을 삭제해도 그 안의 종목은 지우지 않는다"를 정했고, 그 구현으로
**실제 "미분류" 자산군 row**를 이름으로 find-or-create해서 살아있는 종목을 거기로
재배정했다. ADR-0057은 그 재배정이 소프트 삭제된 종목까지 잡아 "미분류"가 무한
재생성되던 버그를 고치면서, `group_id`를 nullable로 만들되 **"null은 오직 소프트
삭제된 종목이 그룹까지 잃은 경우만 뜻한다"**로 의미를 좁혔다.

그런데도 사용자가 같은 증상을 다시 겪었다: 종목이 든 자산군을 지우면 "미분류"가
생기고, 그 "미분류"를 지우면 (그 안의 활성 종목들이 갈 데가 없어) 새 "미분류"가 또
생긴다. 근본 원인은 **"미분류"가 실제 그룹 row라는 것 자체**다 — 지울 수 있는데
지우면 안의 종목이 오갈 데가 없어 스스로를 재생성한다.

사용자 피드백: `group_id = null`은 그냥 "어느 자산군에도 속하지 않음"이고, 거기에
도달하는 경로가 (a) 종목 소프트 삭제 (b) 자산군 삭제 **두 가지로 늘어난 것**으로
보면 된다. "미분류"라는 버킷을 만들 필요 자체가 없다.

## Decision

**"미분류"라는 실제 그룹도, 합성 버킷도 만들지 않는다. `group_id = null` = "어느
자산군에도 속하지 않음" 하나의 의미로 통일한다.**

- **`deleteGroup`** (`lib/api/groups.ts`): `update holdings set group_id = null where group_id = <id>` (활성/소프트삭제 구분 없이 전부) → 그룹 delete. `findOrCreateUnclassifiedGroup`, `UNCLASSIFIED_GROUP_NAME`, `clearHoldingGroup` 전부 제거.
- **`computeRebalance`** (`lib/calc/rebalance.ts`): `group_id`가 null인 종목은 어떤 `GroupCalc`에도 안 들어간다. 따라서 **그룹 비중의 합이 100% 미만일 수 있다**(미지정 몫만큼 빔) — 이건 의도된 것이다. 그 종목들은 `RebalanceResult.holdings`엔 그대로 있고 `groupName`은 **빈 문자열**이 된다.
- **`RebalanceResult.groups`**: 실제 자산군만. 합성 "미분류" 필드는 추가하지 않는다. `UNGROUPED_KEY` 상수는 export하지만 이건 draft·dnd 레이어에서 미지정을 가리키는 **센티널 클라이언트 키**일 뿐, "그룹"이 아니다.
- **`/portfolio` 읽기 모드**: 미지정 종목은 도넛·카드에 안 나온다. 그 아래 한 줄 요약만("자산군 미지정 종목 N개 (₩X) — 위 비중에는 포함되지 않습니다").
- **`/portfolio` 편집 모드**: 그룹 카드 밑에 `UngroupedHoldingsCard`("자산군 미지정") 목록. 이름·목표%·삭제·순서 이동 없음 — 여기 종목을 드래그해 실제 자산군에 배정하는 용도(반대로 그룹→미지정 드래그로 배정 해제도 가능). `deleteDraftGroup`은 삭제된 그룹의 draft 종목을 `UNGROUPED_KEY`로 옮겨 바로 이 목록에 나타나게 하고, `commitPortfolioDraft`가 `groupClientKey === UNGROUPED_KEY` → `group_id = null`로 커밋한다.
- **`updateHolding` patch 타입** → `groupId?: string | null` 허용 (`HoldingPatch`, `lib/api/holdings.ts`). ADR-0057이 "살아있는 종목의 group_id를 실수로 지우는 걸 막으려" 넣었던 non-null 가드는 뺀다 — 활성 종목 언분류가 이제 정당한 작업이다.
- **`NewHolding.groupId`는 non-null 유지** — 종목 생성은 항상 실제 자산군 필수. 미지정으로 새로 만들 수는 없다.
- **`/holdings`**: 자산군 칸은 빈 채로 보인다(`groupName === ""`). 필터에는 미지정 종목이 있을 때만 "미지정" 옵션이 뜬다(종목 폼에는 안 넘긴다). `HoldingsHeatmap`은 `groupName || '미지정'` 폴백으로 "미지정" 그룹을 그린다.

## Consequences

- ADR-0035의 결론("자산군 삭제가 종목을 안 지운다")은 그대로다. 메커니즘만 "미분류 그룹으로 재배정" → "group_id null"로 바뀐다.
- ADR-0057의 nullable `group_id`는 유지되지만, "null = 소프트 삭제 전용"이라는 좁힌 의미는 폐기 — null은 이제 활성 종목도 가질 수 있다. `group_id`와 `deleted_at`이 직교(orthogonal)한다: `group_id = null`은 "자산군 없음", `deleted_at`은 "삭제됨", 서로 독립.
- "미분류 무한 재생성" 버그 클래스가 원천적으로 사라진다 — 재생성할 그룹 row 자체가 없다.
- 그룹 비중 도넛의 합이 100% 미만일 수 있다. 카드·범례의 % 숫자는 여전히 전체 대비 실제 %라 정확하지만(분모가 `totalValue`), 도넛의 시각적 각도는 제공된 값들끼리 정규화돼 "꽉 찬" 것처럼 보인다. 읽기 모드 한 줄 요약으로 보완한다.
- `computeRebalance`·`portfolioDraft`·`HoldingsHeatmap`에서 `h.groupId!` 단언을 걷어내고 null 분기를 넣었다. `RebalanceResult` 소비자(`holdings.tsx` `groupOptions` 등)는 `groups`가 실제 그룹만 담으므로 영향 없다.
- 시장·변동성 축(`computeAxisRebalance`, ADR-0058)은 `group_id`를 안 쓰므로 무영향 — 미지정 종목도 `exposure_region`·σ로 정상 버킷팅된다.
