# ADR-0001: Next.js Pages Router (not App Router)

## Status
Accepted

## Context
`create-next-app`의 기본 스캐폴딩은 App Router를 생성하지만, 사용자가 이미 익숙한 라우팅/데이터 패칭 모델(Pages Router)을 명시적으로 지정했다.

## Decision
`pages/` 디렉토리 기반 Pages Router만 사용한다. App Router(`app/`)는 사용하지 않으며, 스캐폴딩 과정에서 생성됐다면 제거한다.

## Consequences
- React Server Components, 스트리밍 등 App Router 전용 기능은 사용할 수 없다.
- API 라우트는 `pages/api/`, 미들웨어는 Next 16 기준 `proxy.ts`(`export function proxy`)로 작성한다.
- 컴포넌트에 `"use client"` 지시어가 필요 없다 — Pages Router에는 해당 개념이 없다.
