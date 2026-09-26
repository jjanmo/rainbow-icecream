# ADR-0063: 역할·섹터를 하나의 "축 카테고리" 테이블로 통합하고 역할도 동적 목록으로

## Status

Accepted — [ADR-0062](./0062-role-sector-fixed-axes.md)의 "역할은 고정 5개 enum" 부분을 대체한다.

## Context

ADR-0062 직후, 섹터를 삭제할 방법이 없다는 문제를 발견했다 — 멤버가 하나도 없고
목표%도 0인 섹터는 어느 역할 버킷을 펼쳐도 나타나지 않도록 필터링돼 있어서(목록이
쓸데없이 길어지는 걸 막으려던 것), 관리할 화면 자체에 접근할 수가 없었다.

이 문제를 계기로 논의한 결과, 두 가지를 더 바꾸기로 했다:

1. **역할도 섹터처럼 사용자가 추가·삭제할 수 있어야 한다.** 기본값(4개)은 있지만
   고정 enum이 아니다.
2. **역할·섹터 관리(CRUD)는 `/portfolio`의 비중 뷰에 끼워 넣지 않고, 별도 모달로
   분리한다.** 비중 편집 모드 안에 CRUD를 숨겨두면 방금 겪은 것과 같은 "멤버 없는
   항목이 안 보이는" 문제가 구조적으로 반복된다 — 이 앱이 이미 지키는 "정의/관리"와
   "비중 보기"를 분리하는 원칙(ADR-0036: 종목 CRUD는 `/holdings`, `/portfolio`는
   비중 보기·목표% 편집만)과도 일관된다.

## Decision

**역할과 섹터를 `axis_categories` 테이블 하나로 통합한다** — 이름·설명·목표%·순서라는
같은 모양의 데이터이고 `axis`(`'role' | 'sector'`)만 다르기 때문이다.

```ts
export type AxisCategoryType = 'role' | 'sector';
export interface AxisCategory {
  id: string;
  userId: string;
  axis: AxisCategoryType;
  name: string;
  description: string | null;   // 선택, 최대 50자
  targetPct: number;
  sortOrder: number;
  createdAt: string;
}
```

- **기본 역할은 4개로 리셋한다: 성장 / 방어 / 인컴 / 안전.** 기존 5개(성장/방어/
  인컴/헤지/현금성) 중 "헤지"는 보유 종목이 0개라 그대로 없앴고, "현금성"(SGOV 1건)은
  "안전"으로 재매핑했다. 기본 목표%는 성장30/방어25/인컴30/안전15 = 100으로 시드했다
  (사용자가 나중에 `/portfolio`에서 재조정).
- **`holdings.role`(text CHECK 5개 enum) 컬럼을 없애고 `holdings.role_id`(FK)로
  바꾼다** — 이제 역할도 섹터와 똑같이 FK 하나로 참조한다.
- **역할 목표%의 저장 위치가 바뀐다**: 역할이 더 이상 고정 enum이 아니라 실제 row가
  생겼으므로, `axis_targets`(시장 축과 공유하던 테이블)에 저장하던 방식을 버리고
  `axis_categories.target_pct`에 직접 저장한다(섹터와 동일한 방식). `axis_targets`는
  다시 시장 전용으로 되돌아간다(`axis_targets_axis_check`를 `('market')`으로 복원).
- **"축 관리" 모달(`AxisCategoryManagerDialog`, `components/portfolio/`)을 새로
  만든다 — 역할/섹터를 별도 모달로 나누지 않고 하나의 모달 안에서 내부 세그먼트
  버튼(ADR-0051 패턴)으로 전환한다.** `/portfolio` 헤더엔 "역할 관리"/"섹터 관리"
  두 버튼이 아니라 "축 관리" 버튼 하나만 둔다. **이름·설명 CRUD(추가·이름변경·설명·
  삭제) + 드래그 순서 변경(dnd-kit)까지 담당하고, 목표%는 다루지 않는다** — 목표%는
  계속 `/portfolio` 역할 탭 편집 모드(역할은 합계 100% 검증, 섹터는 그 섹터가 속한
  역할 버킷을 펼쳤을 때 맥락 있는 곳에서)에서 편집한다. 드래그 순서 변경은 드롭
  즉시 저장된다(완료 버튼 없음 — 옛 `AxisTabs` 탭 순서 변경과 같은 패턴). 삭제 시
  그 카테고리를 가리키던 종목은 FK `on delete set null`로 자동 미분류/미지정이
  된다 — 종목 자체는 안 지워진다. 삭제 확인은 이 앱의 기존 패턴대로 `AlertDialog`를
  모달 위에 얹어 처리한다. 모달 레이아웃은 제목/축 전환 버튼/설명 문구/"+ 추가"
  버튼을 고정하고 목록만 `max-h`+`overflow-y-auto`로 스크롤한다 — 목록이 길어져도
  헤더·추가 버튼이 화면 밖으로 밀려나지 않는다.
  - **dnd-kit을 다시 설치했다** — ADR-0062 작업 중 어디서도 안 쓰여서 뺐던
    의존성인데(AGENTS.md에 "재도입 전 확인" 메모를 남겨뒀었다), 이번 요청으로
    재도입 조건이 충족됐다. 드래그 감지 센서·`handleDragEnd` 로직은 예전
    `AxisTabs`/`TabEditor`가 쓰던 패턴(`PointerSensor`+`KeyboardSensor`,
    `arrayMove`, 드롭 즉시 저장)을 그대로 재사용했다.
- **`/portfolio` 역할 탭에서도 역할 버킷 자체를 드래그로 재배치할 수 있다** — 모달
  안의 드래그와 별개로, 페이지에서 직접 순서를 바꾸는 것도 요청에 따라 추가했다.
  처음엔 "축 관리" 모달과 같은 방식(편집 모드와 무관하게 항상 가능, 드롭 즉시 저장,
  옛 `AxisTabs` 탭 순서 변경 패턴)으로 만들었으나, **"기존에도 그랬듯이" 옛 자산군
  드래그 원칙(목표% 편집 모드 중에만 가능, draft에 포함, 완료해야 저장·취소하면
  버려짐)으로 정정했다.** `RoleBucketCard`는 `useSortable`을 항상 호출하지만
  `attributes`/`listeners`(따라서 드래그 핸들 자체)를 `isEditing`일 때만 렌더한다 —
  핸들이 아예 안 보이므로 편집 모드가 아니면 드래그를 시작할 방법이 없다.
  `pages/portfolio.tsx`의 `draftRoleOrder`(역할 id 배열, 편집 진입 시 현재 순서로
  시드)가 이 draft를 담고, `finishEditingRole`이 목표%/섹터 목표% 변경분과 함께
  바뀐 `sortOrder`만 `updateAxisCategory`로 반영한다. **모달 안의 순서 변경(항상
  가능, 즉시 저장)은 그대로 둔다** — 모달은 편집 모드라는 개념 자체가 없는 별도
  관리 화면이라 이 규칙이 적용되지 않는다. 시장 축은 버킷이 고정 3개(한국/미국/기타)라
  이 드래그 대상이 아니다.
- **`ClassificationFieldsBlock`/`RoleChips`가 고정 `ROLE_ORDER`/`ROLE_LABELS` 대신
  `roles: AxisCategory[]` prop을 받는 동적 목록으로 바뀐다** — 매매 모달·`/holdings`
  편집 둘 다 이 목록을 그대로 렌더한다. 칩에 "새 역할 추가" 인라인 생성은 없다(섹터의
  콤보박스 create-flow와 달리) — 새 역할은 "역할 관리" 모달에서만 만든다.
- **`description`** — 역할·섹터 각각에 선택 입력 필드로 추가(최대 50자). `/portfolio`의
  역할/섹터 행에 이름 아래 작은 글씨로 표시한다(`computeAxisRebalance`의 `buckets`
  파라미터가 이미 `description?`을 받는 구조라 엔진 변경 없이 그대로 흘려보낸다).

## Consequences

- 이제 역할·섹터 CRUD, 필터 옵션, 표 컬럼, 히트맵 그룹핑까지 전부 `axis_categories`
  하나를 공유한다 — API(`lib/api/axisCategories.ts`)와 훅(`useAxisCategories`)도 하나다.
- `Holding.role: Role | null` → `Holding.roleId: string | null`로 이름이 바뀌었다 —
  `Role` 유니온 타입과 `ROLE_LABELS`/`ROLE_ORDER` 상수는 삭제됐다. 역할 이름을 표시하려면
  항상 `axis_categories`(axis: 'role')를 조회해 id→name 맵을 만들어야 한다(고정 상수
  룩업이 더 이상 없음) — `/holdings` 표·필터·히트맵 전부 이 패턴을 따른다.
- 실 데이터 마이그레이션: 51개 분류된 종목(성장42/방어4/인컴4/헤지0/현금성1)이
  성장42/방어4/인컴4/안전1로 재매핑됐다 — 총 51개 그대로 유지, 안전은 (구)헤지+현금성
  합류분이지만 실제로는 현금성 1개만 있었다. 기존에 사용자가 매매 모달로 미리 만들어
  두었던 섹터 11개(AI하드웨어 등)도 그대로 `axis_categories`(axis: 'sector')로
  이관됐다.
- 역할이 동적 목록이 되면서, 사용자가 역할을 전부 지우면 `/portfolio` 역할 탭이
  빈 상태가 될 수 있다 — `RoleAllocationView`는 이 경우 "아직 역할이 없습니다" 안내와
  함께 목표 100% 검증(빈 배열 합은 0이라 자동으로 미달 처리)이 정상 동작한다.
