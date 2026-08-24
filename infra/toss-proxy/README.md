# Toss Open API 고정 IP 리버스 프록시 — 운영 런북

배경과 설계 결정은 [ADR-0053](../../docs/adr/0053-toss-fixed-ip-reverse-proxy.md) 참고. 이 문서는 그 결정을 실제로 세팅하는 절차만 담는다.

**주의**: 아래 어디에도 실제 IP·시크릿·토큰 값을 적지 않는다. 실제 값은 (1) 로컬 `.env.local`, (2) Vercel 대시보드 환경변수, (3) VM의 `/etc/nginx/snippets/toss-proxy-secret.conf`(git 밖) 세 곳에만 존재한다.

## 아키텍처

```
Next.js (tossFetch) → https://<이름>.duckdns.org (오라클 VM, Reserved Public IP) → https://openapi.tossinvest.com
```

Reserved Public IP는 Toss 화이트리스트용 "고정 IP" 문제를, DuckDNS 서브도메인은 Let's Encrypt가 IP가 아닌 도메인에만 인증서를 발급한다는 제약 때문에 별도로 필요하다 — 둘은 서로 다른 문제를 해결한다.

## 1. 사용자만 할 수 있는 작업

1. **OCI CLI 인증 연결**: `oci session authenticate --region <홈 리전>` 실행 후 브라우저 로그인 승인. 세션 토큰이 로컬에 저장되면 이후 `oci` 명령을 실행할 수 있다.
2. **DuckDNS 가입 및 서브도메인 연결**: duckdns.org에서 무료 가입(Google 등 OAuth 로그인) 후 원하는 서브도메인 생성, IP 필드에 2절에서 만든 Reserved Public IP를 입력해 저장. 로그인 시 발급되는 토큰은 계정 DNS 갱신 권한을 가진 값이라 재사용하지 않는다.
3. **Toss 콘솔**: 2절에서 만든 Reserved Public IP를 고정 IP 화이트리스트에 등록.
4. **Vercel 대시보드**: 프로젝트 → Settings → Environment Variables (Production)에
   - `TOSS_PROXY_BASE_URL=https://<서브도메인>.duckdns.org`
   - `TOSS_PROXY_SHARED_SECRET=<시크릿 — 3절에서 VM에 심은 값과 동일해야 함>`

## 2. OCI CLI로 인프라 생성 (전부 Always Free 한도 안)

VCN → 인터넷 게이트웨이 → 기본 라우트 테이블(0.0.0.0/0 → IGW) → 기본 Security List → 서브넷 순으로 만든 뒤 인스턴스를 띄운다.

1. Security List 인바운드 규칙: 80·443은 0.0.0.0/0 허용(Vercel 호출부 IP가 유동적이라 소스 제한이 불가능 — 시크릿 헤더가 유일한 인증 수단), 22는 관리자의 현재 공인 IP(`curl ifconfig.me`)로 `/32` 제한.
2. VM 인스턴스 생성 — **Ampere A1 Flex(1 OCPU/6GB)가 1순위지만 리전에 따라 "Out of host capacity" 에러가 흔하다.** 그 경우 VM.Standard.E2.1.Micro(x86, 별도 용량 풀)로 재시도하면 대체로 성공한다. 둘 다 Always Free 한도 안.
3. Reserved Public IP 생성 후 인스턴스 VNIC의 private IP에 연결 (Ephemeral IP는 재부팅 시 바뀌므로 반드시 Reserved로 만들 것).
4. 생성 직전 `oci limits value list --service-name compute`로 Always Free 한도 안인지 재확인 — 의도치 않은 과금 방지.

## 3. VM 내부 설정 (SSH 접속 후)

1. Oracle 이미지가 기본으로 걸어두는 iptables에서 80/443 오픈 (Security List만 열면 여전히 막힘 — 자주 놓치는 지점): `iptables -I INPUT -p tcp --dport 80 -j ACCEPT`, 443도 동일, `netfilter-persistent save`로 재부팅 후에도 유지.
2. `apt-get install nginx certbot python3-certbot-nginx`.
3. **인증서 발급은 2단계로 진행한다** (미리 완성된 443 서버 블록을 배포하면 인증서 파일이 아직 없어서 `nginx -t`가 실패한다):
   1. `/.well-known/acme-challenge/` 경로만 서빙하는 80번 포트 전용 임시 설정을 `sites-enabled`에 올리고 리로드.
   2. `certbot certonly --webroot -w /var/www/html -d <서브도메인>.duckdns.org --non-interactive --agree-tos --register-unsafely-without-email` 로 인증서 발급 (certbot이 자동 갱신 타이머도 등록해준다).
   3. 그제서야 [`nginx.conf`](./nginx.conf)(443 서버 블록 포함, `REPLACE_WITH_DUCKDNS_SUBDOMAIN`을 실제 서브도메인으로 치환)를 `/etc/nginx/sites-available/toss-proxy.conf`로 배치하고 `sites-enabled`에 심볼릭 링크, 임시 설정은 제거.
4. `/etc/nginx/snippets/toss-proxy-secret.conf` 생성 — [`toss-proxy-secret.conf.example`](./toss-proxy-secret.conf.example)을 참고해 실제 시크릿 값(1절의 `TOSS_PROXY_SHARED_SECRET`과 동일, `openssl rand -hex 32`로 생성 권장)을 채운다. **`/etc/nginx/conf.d/`에 두면 안 된다** — Debian/Ubuntu 기본 `nginx.conf`가 그 디렉토리를 `http {}` 블록에서 자동 include하는데 `set` 지시자는 `server {}` 안에서만 허용돼 "set directive is not allowed here" 에러가 난다. `server {}` 안에서만 명시적으로 include되는 `/etc/nginx/snippets/`를 쓴다.
5. `nginx -t && systemctl reload nginx && systemctl enable nginx`.
6. systemd 재시작 정책 override 추가 — `/etc/systemd/system/nginx.service.d/override.conf`에 `Restart=on-failure` / `RestartSec=5` / `StartLimitIntervalSec=300` / `StartLimitBurst=5`를 넣고 `systemctl daemon-reload`. 기본 nginx.service는 재시작 정책이 없어서, 한 번 기동 실패하면 사람이 손으로 살릴 때까지 계속 죽어있는다(아래 트러블슈팅 참고) — 이 override가 그 상황의 자동 복구 안전장치.

## 검증

- `curl -H "X-Toss-Proxy-Secret: 틀린값" https://<서브도메인>.duckdns.org/api/v1/prices?symbols=005930` → 403.
- 앱 쪽 `.env.local`에 실제 값 채우고 `/api/toss/prices` 호출 → VM의 nginx 접근 로그에 요청이 찍히고 정상 응답이 오는지 확인.

## 트러블슈팅: Vercel에서 `ECONNREFUSED <VM IP>:443`

**실제로 겪은 장애 (2026-08-24)**: 배포 다음 날 오후, Vercel 함수 로그에 `TypeError: fetch failed` + `ECONNREFUSED <VM IP>:443`가 찍히기 시작했다. 원인은 VM도 iptables도 아니라 **nginx 프로세스 자체가 죽어있던 것** (`systemctl status nginx` → `failed`).

`journalctl -u nginx`로 확인한 인과관계:
1. Ubuntu의 `unattended-upgrades`가 매일 새벽 자동 실행되며 `systemd-resolved`(DNS)를 재시작한다.
2. 그 짧은 창에 nginx도 함께 재시작됐는데, `nginx.conf`(당시 버전)의 `proxy_pass https://openapi.tossinvest.com;`이 도메인을 **리터럴로** 쓰고 있어서, nginx가 그 주소를 `nginx -t`(ExecStartPre) 시점에 한 번만 resolve한다.
3. 하필 그 순간 DNS가 잠깐 죽어있어서 `nginx -t`가 `host not found in upstream "openapi.tossinvest.com"`으로 실패했고, nginx는 기동 자체를 거부했다.
4. 당시 nginx.service에는 재시작 정책이 없어서, 그대로 몇 시간 죽어있었다 — Toss 연동이 전부 막힌 채로.

**적용한 수정** (현재 [`nginx.conf`](./nginx.conf)에 반영됨):
- `resolver 1.1.1.1 8.8.8.8 valid=300s;` + `set $toss_upstream "openapi.tossinvest.com"; proxy_pass https://$toss_upstream;` — 도메인을 변수로 참조하면 요청 시점마다 resolver를 통해 재해석하므로, 순간적인 DNS 장애가 있어도 그 요청만 실패하지 nginx 자체가 죽지 않는다. **`proxy_pass`에 도메인을 리터럴로 절대 되돌리지 말 것.**
- 3절 6번의 `Restart=on-failure` systemd override — 위 수정으로도 못 막는 다른 원인의 실패가 다시 나더라도 사람이 손대지 않아도 자동으로 살아나도록 하는 안전장치.

**진단 순서** (같은 증상이 다시 나면): ① `ssh`로 VM 접속 가능한지 → ② `systemctl status nginx`로 서비스 상태 → ③ `journalctl -u nginx --no-pager -n 80`으로 실패 원인 → ④ `nginx -t`로 지금 설정이 유효한지. iptables/Security List는 이 장애의 원인이 아니었으므로 우선순위 낮게 확인.
