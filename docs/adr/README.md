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
| [0008](./0008-rebalance-threshold.md) | 리밸런싱 기준 5%p, 통계 카드는 기준 초과만 표시 | Superseded by ADR-0026 |
| [0009](./0009-controlled-numeric-inputs.md) | 숫자 입력은 문자열 초안 상태로 처리 | Accepted |
| [0010](./0010-dual-allocation-metrics.md) | 설정 페이지 "목표 배분"/"실제 채워짐" 이중 지표 | Accepted |
| [0011](./0011-src-directory.md) | 앱 코드를 src/ 디렉토리로 이동 | Accepted |
| [0012](./0012-avg-price-native-currency.md) | 평균매입가는 종목의 원래 통화(국내=KRW, 해외=USD)로 입력 | Accepted |
| [0013](./0013-setup-actual-weight-and-full-holding-add.md) | 설정 페이지 "실제 보유 비중"으로 교체 + 종목 추가 시 전체 항목 입력 | Accepted |
| [0014](./0014-setup-full-holding-edit.md) | 설정 페이지에서 종목 수정도 전체 항목 편집 가능하도록 확장 | Superseded by ADR-0015 |
| [0015](./0015-setup-accordion-and-dnd-reorder.md) | 설정 페이지 종목 수정을 아코디언으로, dnd-kit으로 순서 변경 | Accepted |
| [0016](./0016-block-completion-over-100-target.md) | 자산군 목표 비중 합계 100% 초과 시 완료 차단 | Superseded by ADR-0037 |
| [0017](./0017-group-cards-collapse-by-default.md) | 자산군 카드 기본 접힘, 클릭해야 종목 목록 노출 | Accepted |
| [0018](./0018-remove-in-group-weight-from-setup-ui.md) | 설정 페이지 UI에서 그룹 내 비중 편집/표시 제거 | Accepted |
| [0019](./0019-group-dnd-and-derived-color.md) | 자산군 드래그 재정렬 + 위치 기반 자동 색상 (수동 색상 설정 제거) | Accepted |
| [0020](./0020-setup-donut-chart.md) | 설정 페이지 상단을 바 차트에서 도넛 차트로 교체 | Accepted |
| [0021](./0021-setup-holding-panels.md) | 설정 페이지 종목 표시 — 읽기 2컬럼 파이+리스트, 편집 접힌 줄 요약 | Accepted |
| [0022](./0022-cash-like-holding-entry.md) | 종목 모달에 원화/달러 체크박스로 현금성 자산 등록 경로 복구 | Accepted |
| [0023](./0023-rebalance-page-dedup.md) | 비중 체크 페이지에서 설정/보유종목 페이지와 중복되는 내용 제거 | Accepted |
| [0024](./0024-group-level-rebalance-only.md) | 리밸런싱 판단은 자산군 단위로만 (종목 단위 목표/괴리 제거) | Accepted |
| [0025](./0025-holding-color-pinned-to-creation-order.md) | 종목 색상은 최초 생성 순서에 고정 (드래그 재정렬과 분리) | Superseded by ADR-0040 |
| [0026](./0026-diff-sign-colors-and-threshold-10.md) | 괴리는 상승/하락 색, 조치 여부는 같은 계열 강조 · 기준 10%p · 리밸런싱 상태 컬럼 | Accepted |
| [0027](./0027-execution-ledger-as-holding-source.md) | 보유 수량·평단은 체결 원장에서만 계산 (기존 보유는 기초잔고 체결로 흡수) | Accepted |
| [0028](./0028-derive-fees-and-taxes.md) | 수수료·증권거래세는 계산하고 체결에 스냅샷 (국내 ETF 매도 면세) | Superseded by ADR-0034 |
| [0029](./0029-fx-rate-snapshot.md) | 환율은 체결 시점 값 고정 저장, 환전 스프레드는 별도 비용 아님 | Superseded by ADR-0038 |
| [0030](./0030-number-with-rounding-guard.md) | 금액은 number 유지 + 반올림 경계에서 표현 오차 봉쇄 | Accepted |
| [0031](./0031-structured-tags-and-separated-notes.md) | 정성 데이터는 구조화 태그 우선, 노트는 체결과 분리 | Accepted |
| [0032](./0032-soft-delete-and-full-replay.md) | 체결 수정·삭제는 soft delete + 해당 종목 전체 리플레이 | Accepted |
| [0033](./0033-trade-note-capture-in-execution-sheet.md) | 근거·태그를 체결 입력 시트에서 접이식으로, 매도 시 매수 근거 배너 표시 | Accepted |
| [0034](./0034-remove-fee-tax-modeling.md) | 수수료·증권거래세 계산 제거, 환율만 유지 | Accepted |
| [0035](./0035-group-delete-reassigns-to-unclassified.md) | 자산군 삭제는 하위 종목을 지우지 않고 "미분류"로 이동 | Accepted |
| [0036](./0036-holding-crud-moved-to-holdings-page.md) | 종목 CRUD를 보유종목 페이지로 일원화, 설정 페이지엔 자산군 간 dnd 추가 | Accepted |
| [0037](./0037-block-completion-under-100-target-too.md) | 자산군 목표 비중 합계 100% 미만도 완료 차단 | Accepted |
| [0038](./0038-drop-fx-rate-native-currency-pnl.md) | 체결에 환율을 저장하지 않고, 실현손익은 거래 통화 기준으로만 표시 | Accepted |
| [0039](./0039-execution-edit-entry-point.md) | 매매일지에 체결 수정 진입점 추가, 종목 재배정은 미지원 | Accepted |
| [0040](./0040-remove-per-holding-color.md) | 종목별 색상을 없앰 (자산군 색은 유지) | Accepted |

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
