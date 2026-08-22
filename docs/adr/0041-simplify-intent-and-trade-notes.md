# ADR-0041: 매매 의도 세부 구분 제거, 근거를 태그+자유서술로 단순화

## Status
Partially superseded by [ADR-0042](./0042-remove-trade-note-tags.md) — 태그 필드/UI는 제거되고 자유 서술(body)만 남았다. 나머지(매매 의도 제거, EXECUTION 단일 타겟팅, 수정 모드 근거 편집)는 유지된다.

## Context

ADR-0031/0033이 설계한 매매일지 입력은 매매 의도(신규진입/추가매수/분할익절/전량청산/손절/리밸런싱), 구조화 근거(셋업 태그, 청산조건, 손절가/목표가 — 매수 전용 POSITION 노트), 감정·매도사유·계획 여부(매도 전용 EXECUTION 노트)를 각각 다른 UI로 입력받았다. 실사용 결과 이 구분이 실제로 쓰이지 않았다 — 의도 값은 어떤 계산·집계에도 읽히지 않았고(리플레이는 side/qty/price만 본다), 구조화 근거 필드도 거의 채워지지 않았다. 반면 "종목 선택 시 계좌가 묶여 있어 찾기 불편하다", "체결 목록에서 한눈에 알아볼 태그가 없다"는 실사용 마찰이 더 컸다.

## Decision

**매매 의도 세부 구분을 없앤다.** `executions.intent`는 `OPENING_BALANCE`(기초잔고, ADR-0027) 여부만 구분하고 나머지는 전부 `NEW` 하나로 합친다. `ExecutionFormDialog`에서 의도 선택 UI를 없애고, 항상 `intent: 'NEW'`를 저장한다. 기존 값도 마이그레이션으로 정리한다(계산에 쓰인 적이 없으므로 데이터 손실이 아니다).

**근거를 태그 + 자유 서술 두 필드로 단순화한다.** `trade_notes`의 `setup_tags`/`emotion_tags`/`exit_reason`/`followed_plan`/`invalidation_condition`/`stop_price`/`target_price`를 `tags`(자유 입력, `setup_tags`를 이름만 바꿈) + `body`(자유 서술) 두 필드로 합친다. 매수/매도 동일한 형태이고, `ExecutionFormDialog`는 접이식(아코디언) 없이 항상 이 두 입력을 보여준다.

**노트 타깃을 EXECUTION으로 통일한다.** ADR-0031/0033은 매수 근거를 POSITION(홀딩 단위, 분할매수해도 하나)에, 매도 근거를 EXECUTION(그 체결 하나)에 나눠 저장했다. 이번 변경으로 태그를 "매매일지 행 배지"로 보여줘야 하는데, POSITION 노트는 홀딩당 하나뿐이라 여러 매수 행에 같은 배지가 반복되는 문제가 생긴다. 그래서 매수/매도 모두 `targetType: 'EXECUTION'`, `targetKey: execution.id`로 저장한다 — 체결마다 독립된 태그를 붙일 수 있다. `POSITION`/`DAY` 타입은 과거 데이터·향후 확장을 위해 타입에는 남겨두지만, 지금 UI는 EXECUTION만 쓴다.

**체결 수정 시 근거도 함께 수정 가능해졌다.** ADR-0039는 "근거는 이 다이얼로그에 별도 편집 경로가 없다"며 수정 모드에서 근거 섹션을 숨겼다 — POSITION 노트가 여러 매수에 걸쳐 공유되는 구조라 "이 체결의 근거"라는 개념이 없었기 때문이다. EXECUTION 전용으로 바뀌면서 체결 하나와 노트 하나가 1:1이 되어, 수정 모드에서도 근거를 불러와 고칠 수 있다.

**종목 선택을 계좌 필터 + 종목 콤보박스로 분리한다.** 기존엔 "종목명 (티커) · 계좌"를 한 Select에서 골랐다. 이제 계좌(Select, 좁히는 용도)와 종목(Combobox, 자유 입력 필터링 — `@base-ui/react`의 combobox 프리미티브를 `shadcn add combobox`로 받아 base-nova 스타일에 맞춤)을 나란히 둔다. 해외 종목은 `티커(이름)` 형식으로 표기해 티커로 바로 찾을 수 있게 한다.

## Consequences

- `INTENT_LABELS`/`BUY_INTENTS`/`SELL_INTENTS`/`EMOTION_TAGS`/`EXIT_REASON_LABELS`/`ExitReason`가 죽은 코드가 되어 전부 지웠다. `ExecutionsFilterBar`/`ExecutionsTable`/`ExecutionDetailDialog`의 의도 필터·컬럼도 없앴다.
- 기존 `trade_notes`의 구조화 필드 값이 있었다면(이 프로젝트 실 데이터는 없었다) body에 접어 넣은 뒤 컬럼을 지우는 마이그레이션을 거쳤다 — `supabase/schema.sql` 하단 참고.
- "매도 시 매수 근거가 배너로 뜨는" ADR-0033의 장치는 사라진다. POSITION 노트를 더 이상 쓰지 않으므로 매수 시점 근거를 매도 화면에서 자동으로 다시 보여줄 방법이 없다 — 필요해지면 별도 기능으로 재도입해야 한다.
- 태그별 승률·기대값 집계(ADR-0031이 노린 핵심 가치)는 사실상 포기한다. 자유 태그라 오타로 갈라질 수 있고, `followedPlan` 같은 고정 열여형 교차 분석도 더 이상 없다 — 이번 결정은 "기록 자체가 잘 안 됐다"는 실사용 결과를 "집계 가능성"보다 우선한 것이다.
- `docs/PRD.md` §3의 관련 요구사항(매매 의도 상태 분기, 매도 시 근거 배너, 구조화 태그 우선)도 이 ADR에 맞춰 갱신했다.

## 대안

- **POSITION 노트를 유지하고 EXECUTION 노트만 단순화**: 매수 행 배지가 여전히 홀딩당 하나로 묶여 "이 매수의 태그"를 표현할 수 없어 기각.
- **매매 의도 값 종류만 줄이고 필드는 유지**: 어차피 어디서도 안 읽는 값이라 UI에 남겨둘 이유가 없어 기각.
