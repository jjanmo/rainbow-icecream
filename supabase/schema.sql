-- Rainbow Icecream portfolio manager schema.
-- Apply this in your Supabase project's SQL editor. Not run automatically.

create extension if not exists "pgcrypto";

create table if not exists asset_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  target_pct numeric not null default 0 check (target_pct between 0 and 100),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Deliberately no flavor_index/color column: each group's color is derived
-- purely from its position among the user's groups (see lib/calc/color.ts
-- hueForGroupIndex), evenly spaced around the hue wheel so it stays
-- maximally distinct regardless of how many groups exist. Not user-settable.

create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- restrict, not cascade: deleting a group must not delete its holdings.
  -- lib/api/groups.ts's deleteGroup reassigns active holdings to a "미분류"
  -- group first (find-or-create), so this FK should never actually block a
  -- delete in practice — it's a safety net if that reassignment is ever
  -- skipped. Nullable (ADR-0057): a soft-deleted holding's group_id gets set
  -- to null instead of reassigned — it's already invisible everywhere, so
  -- forcing it onto some real group (even "미분류") would be false data, and
  -- specifically caused "미분류" to endlessly recreate itself when deleted
  -- (a dead holding left pointing at it kept tripping the same reassignment).
  group_id uuid references asset_groups(id) on delete restrict,
  ticker text,
  name text not null default '새 종목',
  target_pct_in_group numeric not null default 0 check (target_pct_in_group between 0 and 100),
  qty numeric not null default 0 check (qty >= 0),
  avg_price numeric not null default 0 check (avg_price >= 0),
  account text,
  region text not null default '국내' check (region in ('국내', '해외')),
  /** 상품 자체의 고정된 분류 — 사용자가 설정하는 자산군(전략별 그룹)과는 별개다.
   * 필수값, 기본값 ETF (ADR-0047). REIT 제거·GOLD 추가는 ADR-0061. */
  asset_type text not null default 'ETF' check (asset_type in ('STOCK', 'ETF', 'ETN', 'FUND', 'BOND', 'GOLD', 'CASH')),
  sort_order int not null default 0,
  /** soft delete — hard delete would cascade through executions/trade_notes and
   * permanently lose that history, even though re-buying the same holding later
   * should surface it again (ADR-0045). */
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Deliberately no current_price/price_updated_at columns: current price is
-- always a derived, live value fetched from Toss at read time (see
-- lib/calc/rebalance.ts + hooks/useLivePrices.ts), never persisted.

create index if not exists holdings_user_group_idx on holdings (user_id, group_id);
create index if not exists asset_groups_user_idx on asset_groups (user_id);
create index if not exists holdings_user_active_idx on holdings (user_id) where deleted_at is null;

-- updated_at auto-touch
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = '';

drop trigger if exists asset_groups_set_updated_at on asset_groups;
create trigger asset_groups_set_updated_at
  before update on asset_groups
  for each row execute function set_updated_at();

drop trigger if exists holdings_set_updated_at on holdings;
create trigger holdings_set_updated_at
  before update on holdings
  for each row execute function set_updated_at();

alter table asset_groups enable row level security;
alter table holdings enable row level security;

drop policy if exists "own groups" on asset_groups;
create policy "own groups" on asset_groups
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- holdings: must own the row AND own the group it points to (blocks cross-user group_id insertion).
-- group_id may be null only for a soft-deleted holding (ADR-0057).
drop policy if exists "own holdings" on holdings;
create policy "own holdings" on holdings
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (group_id is null or group_id in (select id from asset_groups where user_id = auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 매매일지 (trading journal) — ADR-0027 ~ 0032, 0041
-- ---------------------------------------------------------------------------

-- The execution ledger. Single write path for 보유수량/평균매입가 (ADR-0027):
-- holdings.qty / holdings.avg_price are a materialized replay of these rows,
-- never edited independently. A holding's pre-journal balance lives here too,
-- as one intent='OPENING_BALANCE' row.
create table if not exists executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  holding_id uuid not null references holdings(id) on delete cascade,
  side text not null check (side in ('BUY', 'SELL')),
  -- 세부 매매 의도(신규진입/추가매수/...) 구분은 뺐다 (ADR-0041) — OPENING_BALANCE
  -- 표시(기초잔고 vs 실제 매매 구분, ADR-0027)만 유지하면 되고 나머지는 UI에서 안 쓴다.
  intent text not null default 'NEW' check (intent in ('OPENING_BALANCE', 'NEW')),
  -- 기초잔고는 "매매일"이라는 게 없는 개념이라 날짜를 강제하지 않는다 — 실제
  -- 매매(NEW)만 필수다 (ADR-0048, 아래 executions_executed_at_required_for_trade).
  executed_at timestamptz,
  qty numeric not null check (qty > 0),
  /** In the holding's native currency (KRW for 국내, USD for 해외). */
  price numeric not null check (price >= 0),
  -- Deliberately no fx_rate column: 실현손익은 거래 통화(해외=USD, 국내=KRW)
  -- 기준으로만 보여주고 원화로 환산하지 않는다 (ADR-0038, ADR-0029를 대체).
  -- Deliberately no fee/tax columns: 수수료·증권거래세는 계산하지 않는다
  -- (ADR-0034) — 브로커·이벤트 할인율마다 달라 정밀 계산의 실익이 낮다고 판단.
  /** soft delete — physical deletes would make past 실현손익 unexplainable (ADR-0032). */
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint executions_executed_at_required_for_trade check (intent = 'OPENING_BALANCE' or executed_at is not null)
);

-- Replay always scans one holding's rows in executed_at order, so this is the
-- index that matters. Partial on deleted_at since every read filters it out.
create index if not exists executions_holding_time_idx
  on executions (holding_id, executed_at) where deleted_at is null;
create index if not exists executions_user_time_idx
  on executions (user_id, executed_at) where deleted_at is null;
-- At most one opening balance per holding.
create unique index if not exists executions_one_opening_balance_idx
  on executions (holding_id) where intent = 'OPENING_BALANCE' and deleted_at is null;

-- Qualitative record, deliberately NOT columns on executions: 체결과 분리된
-- 별도 엔티티로 두는 이유는 ADR-0031 그대로다. 구조화 필드(태그 포함)는 전부
-- 없애고 자유 서술 하나로 단순화했고, 체결 하나당 노트 하나로 고정했다 (ADR-0043,
-- ADR-0041/0042가 시작한 단순화의 마지막 단계 — POSITION/DAY 타겟팅 자체를 없앴다).
create table if not exists trade_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  execution_id uuid not null references executions(id) on delete cascade,
  /** 자유 서술 — 어떤 집계에도 쓰이지 않는다. */
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists trade_notes_execution_idx
  on trade_notes (execution_id);

drop trigger if exists executions_set_updated_at on executions;
create trigger executions_set_updated_at
  before update on executions
  for each row execute function set_updated_at();

drop trigger if exists trade_notes_set_updated_at on trade_notes;
create trigger trade_notes_set_updated_at
  before update on trade_notes
  for each row execute function set_updated_at();

alter table executions enable row level security;
alter table trade_notes enable row level security;

-- executions: own the row AND own the holding it points to.
drop policy if exists "own executions" on executions;
create policy "own executions" on executions
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and holding_id in (select id from holdings where user_id = auth.uid())
  );

-- trade_notes: own the row AND own the execution it points to (같은 패턴을 executions에도 쓴다).
drop policy if exists "own trade notes" on trade_notes;
create policy "own trade notes" on trade_notes
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and execution_id in (select id from executions where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Migration: absorb each existing holding's balance as an OPENING_BALANCE
-- execution (PRD §4 F-7). Idempotent — skips holdings that already have one.
-- Run once, after the tables above exist.
-- ---------------------------------------------------------------------------
insert into executions (user_id, holding_id, side, intent, executed_at, qty, price)
select h.user_id, h.id, 'BUY', 'OPENING_BALANCE', h.created_at, h.qty, h.avg_price
from holdings h
where h.qty > 0
  and not exists (
    select 1 from executions e
    where e.holding_id = h.id and e.intent = 'OPENING_BALANCE' and e.deleted_at is null
  );

-- ---------------------------------------------------------------------------
-- Migration: 수수료·증권거래세 계산 제거 (ADR-0034). Idempotent — `if exists`라
-- 여러 번 실행해도 안전하다. 이미 반영된 프로젝트에서 다시 실행하면 아무 일도
-- 일어나지 않는다.
-- ---------------------------------------------------------------------------
alter table holdings drop column if exists market;
alter table holdings drop column if exists asset_type;
alter table executions drop column if exists fee_amount;
alter table executions drop column if exists tax_amount;
alter table executions drop column if exists applied_fee_rate;
alter table executions drop column if exists applied_tax_rate;
alter table executions drop column if exists cost_overridden;
drop table if exists account_fee_rates;

-- ---------------------------------------------------------------------------
-- Migration: 환율 필드 제거 (ADR-0038). 실현손익은 거래 통화 기준으로만 보여주고
-- 원화로 환산하지 않는다 — 평가금액(보유 중인 종목의 원화 환산)은 그대로 실시간
-- 환율을 쓰며 영향받지 않는다. Idempotent.
-- ---------------------------------------------------------------------------
alter table executions drop column if exists fx_rate;

-- ---------------------------------------------------------------------------
-- Migration: 자산군 삭제가 하위 종목을 지우지 않도록 변경. 종목은
-- lib/api/groups.ts의 deleteGroup이 삭제 전에 "미분류" 자산군으로 재배정한다
-- — 이 FK는 그 재배정이 어떤 이유로든 빠졌을 때 삭제 자체를 막는 안전장치다.
-- Idempotent — 제약을 지우고 다시 만들 뿐이라 여러 번 실행해도 안전하다.
-- ---------------------------------------------------------------------------
alter table holdings drop constraint if exists holdings_group_id_fkey;
alter table holdings add constraint holdings_group_id_fkey
  foreign key (group_id) references asset_groups(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Migration: 매매 의도 세부 구분 제거 + 근거를 태그·자유서술로 단순화 (ADR-0041).
-- 기존 값이 있으면 잃지 않도록 삭제될 필드들을 body에 접어 넣은 뒤 컬럼을 없앤다.
-- Idempotent.
-- ---------------------------------------------------------------------------
update executions set intent = 'NEW' where intent not in ('OPENING_BALANCE', 'NEW');

alter table executions drop constraint if exists executions_intent_check;
alter table executions add constraint executions_intent_check
  check (intent in ('OPENING_BALANCE', 'NEW'));

update trade_notes set body = nullif(trim(both E'\n' from
  coalesce(body, '')
  || case when invalidation_condition is not null then E'\n청산조건: ' || invalidation_condition else '' end
  || case when stop_price is not null then E'\n손절가: ' || stop_price::text else '' end
  || case when target_price is not null then E'\n목표가: ' || target_price::text else '' end
  || case when exit_reason is not null then E'\n매도사유: ' || exit_reason else '' end
  || case when followed_plan is not null then E'\n계획대로: ' || (case when followed_plan then '예' else '아니오' end) else '' end
  || case when coalesce(array_length(emotion_tags, 1), 0) > 0 then E'\n감정: ' || array_to_string(emotion_tags, ', ') else '' end
), '')
where invalidation_condition is not null or stop_price is not null or target_price is not null
   or exit_reason is not null or followed_plan is not null or coalesce(array_length(emotion_tags, 1), 0) > 0;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'trade_notes' and column_name = 'setup_tags'
  ) then
    alter table trade_notes rename column setup_tags to tags;
  end if;
end $$;

alter table trade_notes drop column if exists emotion_tags;
alter table trade_notes drop column if exists exit_reason;
alter table trade_notes drop column if exists followed_plan;
alter table trade_notes drop column if exists invalidation_condition;
alter table trade_notes drop column if exists stop_price;
alter table trade_notes drop column if exists target_price;

-- ---------------------------------------------------------------------------
-- Migration: 태그 기능 제거 (ADR-0042) — 근거는 자유 서술(body) 하나로만 남는다.
-- Idempotent.
-- ---------------------------------------------------------------------------
alter table trade_notes drop column if exists tags;

-- ---------------------------------------------------------------------------
-- Migration: target_type/target_key 제거, execution_id FK로 교체 (ADR-0043).
-- target_type은 이제 항상 'EXECUTION'이라 의미가 없었다. POSITION 노트(예전
-- 방식)가 있으면 내용을 잃지 않도록 그 종목의 가장 이른 체결로 옮긴 뒤 없앤다.
-- Idempotent.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'trade_notes' and column_name = 'target_type'
  ) then
    update trade_notes tn
    set target_type = 'EXECUTION',
        target_key = (
          select e.id::text from executions e
          where e.holding_id = tn.target_key::uuid and e.deleted_at is null
          order by e.executed_at asc, e.id asc
          limit 1
        )
    where tn.target_type = 'POSITION'
      and exists (
        select 1 from executions e where e.holding_id = tn.target_key::uuid and e.deleted_at is null
      );

    alter table trade_notes rename column target_key to execution_id;
    alter table trade_notes alter column execution_id type uuid using execution_id::uuid;
    alter table trade_notes add constraint trade_notes_execution_id_fkey
      foreign key (execution_id) references executions(id) on delete cascade;

    drop index if exists trade_notes_target_idx;
    create unique index if not exists trade_notes_execution_idx on trade_notes (execution_id);

    alter table trade_notes drop column if exists target_type;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Migration: 종목 삭제를 소프트 삭제로 (ADR-0045). Idempotent.
-- ---------------------------------------------------------------------------
alter table holdings add column if not exists deleted_at timestamptz;
create index if not exists holdings_user_active_idx on holdings (user_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Migration: 자산타입 추가, 비고(memo) 제거 (ADR-0046). 기존 memo 값은 버린다. Idempotent.
-- ---------------------------------------------------------------------------
alter table holdings add column if not exists asset_type text
  check (asset_type is null or asset_type in ('STOCK', 'ETF', 'ETN', 'REIT', 'FUND', 'BOND', 'CASH'));
alter table holdings drop column if exists memo;

-- ---------------------------------------------------------------------------
-- Migration: 자산종류를 필수값으로, 기본값 ETF (ADR-0047). 기존에 비어있던 값은
-- ETF로 채운다. Idempotent.
-- ---------------------------------------------------------------------------
update holdings set asset_type = 'ETF' where asset_type is null;
alter table holdings alter column asset_type set not null;
alter table holdings alter column asset_type set default 'ETF';

-- ---------------------------------------------------------------------------
-- Migration: 기초잔고는 날짜 없이 기록 (ADR-0048). 실제 매매(NEW)만 executed_at이
-- 필수다. 기존 기초잔고 행의 날짜도 비워서 예외 없는 불변식으로 만든다. Idempotent.
-- ---------------------------------------------------------------------------
alter table executions alter column executed_at drop not null;

alter table executions drop constraint if exists executions_executed_at_required_for_trade;
alter table executions add constraint executions_executed_at_required_for_trade
  check (intent = 'OPENING_BALANCE' or executed_at is not null);

update executions set executed_at = null where intent = 'OPENING_BALANCE';

-- ---------------------------------------------------------------------------
-- Migration: 과거 환율(USD->KRW) read-through 캐시 (ADR-0055). 유저 스코핑 없음 —
-- 전역 참조 데이터고, 한 번 저장된 날짜의 값은 절대 안 바뀐다(체결일이 있는
-- 매매일지 조회에서만 쓴다 — 평가금액의 실시간 환율은 이 캐시 대상이 아니다).
-- Idempotent.
-- ---------------------------------------------------------------------------
create table if not exists fx_rate_daily (
  rate_date date primary key,
  rate numeric not null check (rate > 0),
  created_at timestamptz not null default now()
);
comment on table fx_rate_daily is 'USD->KRW 일별 확정 환율 캐시(Frankfurter/ECB 기준환율). ADR-0055.';

alter table fx_rate_daily enable row level security;

drop policy if exists "authenticated read fx rates" on fx_rate_daily;
create policy "authenticated read fx rates" on fx_rate_daily
  for select
  using (auth.uid() is not null);

drop policy if exists "authenticated write fx rates" on fx_rate_daily;
create policy "authenticated write fx rates" on fx_rate_daily
  for insert
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Migration: holdings.group_id를 nullable로 (ADR-0057). 그룹이 삭제될 때
-- 소프트 삭제된 종목은 이제 다른 그룹("미분류" 포함)으로 재배정하지 않고
-- group_id를 null로 비운다 — 이미 앱 어디서도 안 보이는 종목이라 실제로
-- 속한 적 없는 그룹을 억지로 가리키게 하는 건 거짓 데이터고, 특히 "미분류"로
-- 보내면 "미분류" 자신을 지울 때 그 죽은 종목이 다시 걸려 새 "미분류"가
-- 끝없이 재생성되는 버그가 있었다. Idempotent.
-- ---------------------------------------------------------------------------
alter table holdings alter column group_id drop not null;

drop policy if exists "own holdings" on holdings;
create policy "own holdings" on holdings
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (group_id is null or group_id in (select id from asset_groups where user_id = auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Migration: 비중 체크 3축(시장/자산군/변동성) — ① 시장 축 (ADR-0058).
-- holdings.exposure_region: 실질 익스포저 지역. nullable — null은 "특정 국가
-- 익스포저가 아님"(현금·채권·원자재)을 뜻하고 시장 축에서 "기타" 버킷으로 집계된다.
-- region(상장 시장·통화)과는 별개 개념이다. Idempotent.
-- ---------------------------------------------------------------------------
alter table holdings add column if not exists exposure_region text
  check (exposure_region is null or exposure_region in ('한국', '미국'));

-- 휴리스틱 백필 — region + 종목명으로 자동 분류. exposure_region이 이미 채워진
-- 행은 건드리지 않으므로 여러 번 실행해도 안전하다(4번 update는 제외 — 항상
-- 같은 결과라 무해).
update holdings set exposure_region = '미국' where region = '해외' and exposure_region is null;
update holdings set exposure_region = '미국'
  where region = '국내' and exposure_region is null and (name ~ '미국|글로벌|나스닥|S&P|해외');
update holdings set exposure_region = '한국' where region = '국내' and exposure_region is null;
update holdings set exposure_region = null where asset_type in ('CASH', 'BOND');
update holdings set exposure_region = null
  where asset_type = 'ETF'
    and (name ~ '국고채|국채|채권|Treasury' or name ~ '금속|광산|희소금속|희토류|원자재|골드|은 ETF');

-- axis_targets: 시장 축의 버킷별 목표 비중. 자산군 축은 asset_groups.target_pct.
-- (변동성 축은 분류 기준 미확정으로 보류 — ADR-0058 ③.)
create table if not exists axis_targets (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  axis text not null check (axis in ('market')),
  bucket text not null,
  target_pct numeric not null default 0 check (target_pct between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, axis, bucket)
);

drop trigger if exists axis_targets_set_updated_at on axis_targets;
create trigger axis_targets_set_updated_at
  before update on axis_targets
  for each row execute function set_updated_at();

alter table axis_targets enable row level security;

drop policy if exists "own axis targets" on axis_targets;
create policy "own axis targets" on axis_targets
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Migration: "미분류"를 실제 그룹 row가 아니라 group_id IS NULL 로 표현 (ADR-0059).
-- ADR-0035/0057이 쓰던 find-or-create "미분류" 그룹을 없앤다. group_id = null 의
-- 의미는 "어떤 자산군에도 속하지 않음" 하나로 통일된다 — 종목 소프트 삭제,
-- 자산군 삭제 두 경로 모두 여기로 온다. deleteGroup(lib/api/groups.ts)은 이제
-- 소속 종목을 전부 group_id = null 로 비우고 그룹을 지운다. Idempotent.
-- ---------------------------------------------------------------------------
update holdings set group_id = null
  where group_id in (select id from asset_groups where name = '미분류');

delete from asset_groups where name = '미분류'
  and not exists (select 1 from holdings h where h.group_id = asset_groups.id);

-- ---------------------------------------------------------------------------
-- Migration: 자산종류 옵션에서 리츠(REIT) 제거, 금현물(GOLD) 추가 (ADR-0061).
-- 계좌는 CHECK 제약이 없는 자유 텍스트라 스키마 변경은 필요 없다 — 파킹통장/
-- 예적금 값은 여기서 일반계좌로 재분류만 한다(옵션에서 CMA/파킹통장/예적금 제거,
-- DC 추가는 화면 드롭다운만 바뀐다). Idempotent.
-- ---------------------------------------------------------------------------
update holdings set asset_type = 'STOCK' where ticker = '395400' and asset_type = 'REIT'; -- SK리츠
update holdings set account = '일반계좌' where account in ('파킹통장', '예적금');

alter table holdings drop constraint if exists holdings_asset_type_check;
alter table holdings add constraint holdings_asset_type_check
  check (asset_type is null or asset_type in ('STOCK', 'ETF', 'ETN', 'FUND', 'BOND', 'GOLD', 'CASH'));

