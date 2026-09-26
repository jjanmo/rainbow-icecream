# ADR-0060: 섹터/테마 분류 — 검토했으나 철회

## Status

Withdrawn (2026-09-02), **Superseded by [ADR-0062](./0062-role-sector-fixed-axes.md)**
(2026-09-25). `holdings.sector` 컬럼·타입·폼 입력·마이그레이션 전부 제거했던 이 결정은
이후 섹터가 "역할에 종속된 2차 분류축"(`sectors` 테이블 + `holdings.sector_id`)으로
다시 도입되면서 뒤집혔다 — 이번엔 목표%·화면(`/portfolio` 역할 탭 중첩 뷰)·매매 모달
입력까지 실제로 쓰이는 1급 개념이라 "죽은 컬럼"이 되는 문제가 없다.

## Context

사용자는 자산군을 `코어`(지수추종) + `엣지_AI`/`엣지_금융`/… 로 나눴다가, 엣지를
섹터별로 다 쪼개니 자산군 목록이 너무 길어져서 엣지를 하나로 합쳤다. 그러니 엣지
하나에 30종목이 들어가 **그 안에서의 섹터 편중을 볼 수가 없어졌다.**

"전략(코어/엣지)"과 "테마(AI/바이오/우주)"는 직교하는 두 축인데 자산군 하나에
우겨넣어 생긴 문제. 처음엔 "4번째 비중 체크 축(섹터 탭)"으로 만들었다가, 사용자가
"탭이 아니라 엣지 자산군 안에서 종목을 섹터로 구분하는 필드"라고 정정 → `holdings.sector`
필드 + `GroupHoldingsPanel`(자산군 펼친 뷰)에서 섹터별 소계를 보여주는 방향으로 선회.

## Decision (철회됨)

`holdings.sector`(고정 enum) 필드를 두고, 자산군을 펼쳤을 때 그 안 종목을 섹터별로
묶어 소계·파이 세그먼트로 보여주려 했다.

**철회 이유**: 그 표시 화면(`GroupHoldingsPanel` 개편)을 사용자가 스펙아웃하기로 했고,
표시가 없으면 입력 필드만 남아 아무 값도 안 하는 죽은 컬럼이 된다. 그래서 필드·폼
입력·마이그레이션·컬럼까지 전부 되돌렸다.

- 삭제: `holdings.sector` 컬럼(`rollback_sector_field` 마이그레이션), `Sector`/`SECTORS`
  타입, `HoldingFormDialog`·`ExecutionFormDialog`의 "섹터·테마" Select, `DraftHolding`/
  `HoldingRow`/`HoldingPatch` 등의 sector 필드.
- 만들었던 "섹터 탭" 축 코드(`SECTOR_BUCKETS`/`sectorBucketOf`, `AxisTabs` 항목,
  `axis_targets` sector 지원)는 그 전에 이미 되돌렸다(`revert_sector_axis_targets`).

## Consequences

- 엣지 30종목의 섹터 편중을 보는 방법은 당분간 없다. 자산군을 다시 몇 개로 쪼개거나
  (사용자가 안 원함), 나중에 이 ADR을 되살려 `GroupHoldingsPanel` 섹터 뷰를 만들어야 한다.
- 휴리스틱 백필 로직(종목명·asset_type → 12개 섹터)은 이 문서와 git 기록에 남아 있어
  재도입 시 재사용 가능.
