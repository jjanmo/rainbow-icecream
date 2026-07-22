# ADR-0011: 앱 코드를 src/ 디렉토리로 이동

## Status
Accepted

## Context
루트에 설정/메타 파일(`eslint.config.mjs`, `next.config.ts`, `tsconfig.json`, `components.json`, `docs/`, `supabase/`, `AGENTS.md`, `CLAUDE.md` 등)이 계속 쌓이면서, 앱 코드(`pages/`, `components/`, `hooks/`, `lib/`, `types/`, `styles/`)와 프로젝트 설정이 뒤섞여 루트가 복잡해졌다. Next.js는 공식적으로 `src/` 디렉토리 컨벤션을 지원한다.

## Decision
`pages/`, `components/`, `hooks/`, `lib/`, `types/`, `styles/`, `proxy.ts`를 `src/` 아래로 이동한다. `public/`, `package.json`, `next.config.ts`, `tsconfig.json`, `.env*`, `docs/`, `supabase/`는 Next.js 컨벤션대로 루트에 유지한다. `tsconfig.json`의 `@/*` 경로 별칭과 `components.json`의 `tailwind.css` 경로만 `src/` 기준으로 갱신하고, 그 외 import 문(`@/lib/...` 등)은 변경 없음.

## Consequences
- 루트에서 "이건 앱 코드, 이건 프로젝트 설정"이 디렉토리 레벨에서 바로 구분된다.
- Vercel 배포 설정(Output Directory 등)에는 영향 없음 — 빌드 산출물 위치(`.next/`)는 소스 위치와 무관하게 항상 프로젝트 루트에 생성된다.
- `git mv`로 이동해 파일 히스토리(rename 추적)는 보존됐다.
- 앞으로 새 파일을 추가할 때 무심코 루트에 만들지 않도록 주의해야 한다(예: 실수로 `lib/foo.ts`를 루트에 생성하면 `src/lib/foo.ts`와 별개로 인식됨).
