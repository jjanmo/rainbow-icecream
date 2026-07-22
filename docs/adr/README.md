# Architecture Decision Records

이 프로젝트의 아키텍처/기술적 의사결정 기록. 각 ADR은 "왜 이렇게 결정했는가"와 그 대가(consequence)를 남긴다 — "무엇을 해야 하는가"는 [`../PRD.md`](../PRD.md)를 참고할 것.

**최신화 규칙**: 새로운 아키텍처/기술 결정이 생기거나 기존 결정이 뒤집힐 때마다(순수 스타일링 제외) 그 즉시 새 ADR을 추가하거나 기존 ADR의 Status를 갱신한다. 결정이 뒤집혔다면 기존 ADR을 지우지 말고 `Status: Superseded by ADR-XXXX`로 남겨서 왜 바뀌었는지 추적 가능하게 한다.

| # | 제목 | 상태 |
|---|---|---|
| [0001](./0001-pages-router.md) | Next.js Pages Router (not App Router) | Accepted |
| [0002](./0002-shared-supabase-project.md) | 기존 공유 Supabase 프로젝트를 app_metadata로 스코핑 | Accepted |
| [0003](./0003-email-password-auth.md) | 매직링크 대신 이메일+비밀번호 인증 | Accepted |
| [0004](./0004-no-stored-current-price.md) | 현재가는 저장하지 않고 항상 라이브로 계산 | Accepted |
| [0005](./0005-toss-polling-strategy.md) | Toss 시세 연동 — 1분 폴링 + 적응형 백오프 | Accepted |
| [0006](./0006-holdings-readonly-modal-edit.md) | 보유 종목 페이지는 읽기 전용 + 모달 편집 | Accepted |
| [0007](./0007-setup-draft-staging.md) | 포트폴리오 설정 편집은 로컬 초안(draft) 방식 | Accepted |
| [0008](./0008-rebalance-threshold.md) | 리밸런싱 기준 5%p, 통계 카드는 기준 초과만 표시 | Accepted |
| [0009](./0009-controlled-numeric-inputs.md) | 숫자 입력은 문자열 초안 상태로 처리 | Accepted |
| [0010](./0010-dual-allocation-metrics.md) | 설정 페이지 "목표 배분"/"실제 채워짐" 이중 지표 | Accepted |

## 새 ADR 작성 형식

```markdown
# ADR-XXXX: <제목>

## Status
Accepted / Superseded by ADR-YYYY / Deprecated

## Context
어떤 상황/문제 때문에 이 결정이 필요했는가.

## Decision
무엇을 하기로 했는가.

## Consequences
이 결정으로 얻는 것과 감수해야 하는 것.
```
