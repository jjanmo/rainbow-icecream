# ADR-0053: Toss 고정 IP 요구 대응 — 오라클 클라우드 리버스 프록시 도입

## Status
Accepted

## Context
Toss 증권 Open API는 화이트리스트에 등록된 고정 IP에서만 호출을 허용한다. 앱은 Vercel 대시보드 연동으로 배포되는데, 저장소 안에 정적 아웃바운드 IP를 보장하는 인프라(vercel.json, Dockerfile, CI 워크플로 등)가 전혀 없어 배포 함수의 아웃바운드 IP가 동적이라고 봐야 한다. 즉 지금 구조로는 Toss가 요구하는 고정 IP를 보장할 수 없다.

## Decision
오라클 클라우드 Always Free VM에 nginx 리버스 프록시를 세워 Toss API 앞단에 둔다. `src/lib/toss/tossAuth.ts`의 `TOSS_BASE_URL`을 `TOSS_PROXY_BASE_URL` env var로 오버라이드 가능하게 하고(미설정 시 기존처럼 Toss 직접 호출 — 로컬 개발은 무수정 동작), 3곳의 Toss 호출(OAuth 토큰, 시세, 환율)이 전부 `tossFetch` 헬퍼를 거치도록 해서 `TOSS_PROXY_SHARED_SECRET`을 `X-Toss-Proxy-Secret` 헤더로 붙인다. 리버스 프록시는 앱↔프록시 구간의 소스 IP를 제한할 수 없으므로(Vercel IP가 유동적) 이 시크릿 헤더가 유일한 인증 수단이다.

포워드 프록시(앱이 프록시를 경유해 나가는 방식) 대신 리버스 프록시(프록시가 Toss인 척 받아서 되쏘는 방식)를 택했다 — `TOSS_BASE_URL` 상수 하나만 오버라이드하면 끝나는 구조라, 호출부마다 프록시 에이전트를 배선해야 하는 포워드 프록시보다 실수 여지가 적다.

VM에 도메인이 없으므로 DuckDNS(무료 Dynamic DNS)로 서브도메인을 받아 Let's Encrypt TLS를 적용한다 — 공인 CA는 IP 주소가 아닌 도메인에만 인증서를 발급하기 때문에, Reserved Public IP(고정 IP 문제 해결)와는 별개로 이름표가 필요하다. VM · Reserved Public IP · DuckDNS · Let's Encrypt · nginx/certbot 전부 무료라 추가 비용 없이 끝난다.

인프라 설정은 `infra/toss-proxy/`에 nginx 설정 템플릿으로 커밋한다(실제 시크릿 값은 별도 git-ignore 파일로 분리, 상세는 해당 디렉토리의 README 참고).

## Consequences
- VM 가용성이 Toss 연동 전체의 단일 장애점이 된다 — VM이 죽으면 시세/환율/체결 조회가 전부 막힌다. **실제로 배포 다음 날 발생**: `nginx.conf`가 `proxy_pass`에 `openapi.tossinvest.com`을 리터럴로 써서 nginx 시작 시점에만 DNS를 resolve했는데, `unattended-upgrades`가 `systemd-resolved`를 재시작하는 순간과 nginx 재시작이 겹치자 `nginx -t`가 DNS 실패로 죽었고 재시작 정책도 없어서 몇 시간 그대로 멈춰있었다 — Vercel에는 `ECONNREFUSED`로 나타났다. `resolver` + 변수 기반 `proxy_pass`(요청 시점 재해석)와 systemd `Restart=on-failure` override로 수정 (상세 경위는 `infra/toss-proxy/README.md`의 트러블슈팅 절 참고).
- Let's Encrypt 인증서 자동 갱신에 의존한다.
- DuckDNS라는 무료 서드파티 서비스에 호스트네임 해석을 의존한다 — 장애 시 대체 수단이 없다. 비용 0원을 우선한 트레이드오프로 accepted.
- 로컬 개발 환경은 여전히 Toss를 직접 호출한다(`TOSS_PROXY_BASE_URL` 미설정). 개발자 로컬 IP가 Toss 쪽에 별도로 허용돼 있어야 한다는 전제가 깔려 있다 — 이 ADR 범위 밖.
- CI/CD 파이프라인 구축은 이번 범위에서 제외했다 — 환경변수는 Vercel 대시보드에서 수동 등록.
