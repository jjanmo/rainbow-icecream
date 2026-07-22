# ADR-0002: 기존 공유 Supabase 프로젝트를 app_metadata로 스코핑해서 재사용

## Status
Accepted

## Context
Supabase 플랜 제약으로 새 프로젝트를 생성할 수 없어, 다른 앱들과 함께 쓰는 기존 프로젝트를 재사용해야 했다. 여러 앱이 같은 Auth 유저 테이블을 공유하게 되므로, 특정 유저가 이 앱에 접근 가능한지 구분할 방법이 필요했다.

## Decision
각 Supabase Auth 유저의 `app_metadata.apps` 배열에 앱 식별자(`"rainbow_icecream"`)를 넣어두고, `proxy.ts`에서 이 값을 확인해 접근을 게이팅한다. 데이터 테이블 자체는 표준 RLS(`user_id = auth.uid()`)로 유저별 격리한다.

## Consequences
- 여러 무관한 앱이 하나의 Supabase 프로젝트를 안전하게 공유할 수 있다.
- 새 유저를 이 앱에 추가하려면 Supabase 대시보드에서 해당 유저의 `app_metadata.apps`에 수동으로 추가해야 한다(자동화된 온보딩 없음).
- 앱별 스코핑이 `proxy.ts`에만 있고 DB 레벨 강제가 아니므로, 이 체크를 우회하는 경로가 생기지 않도록 주의해야 한다.
