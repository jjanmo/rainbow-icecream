# ADR-0042: 근거 태그 제거, 자유 서술만 남긴다

## Status
Accepted

## Context

ADR-0041에서 근거를 태그 + 자유 서술 두 필드로 단순화하고, 태그를 매매일지 행 배지로 노출했다. 실제로 써보니 근거는 자유 서술(메모)에만 적히고 태그는 쓰이지 않았다 — 실 데이터도 태그가 채워진 행이 0건이었다.

## Decision

`trade_notes.tags` 컬럼과 `TagInput` UI를 없앤다. 근거는 `body`(자유 서술) 하나만 남는다. `ExecutionsTable`의 태그 배지 컬럼, `ExecutionDetailDialog`의 태그 표시도 함께 없앤다.

## Consequences

- `TagInput` 컴포넌트가 완전히 안 쓰이게 되어 파일 자체를 지웠다.
- 태그 자동완성 후보 파생(`journal.tsx`의 태그 suggestions)도 함께 없앴다.
- 태그 데이터가 실제로 없었으므로(0건) 별도 데이터 이관 없이 컬럼만 지우면 됐다.
- ADR-0041이 "태그를 매매일지 행 배지로 보여준다"고 정한 부분은 이걸로 대체된다.
