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
  group_id uuid not null references asset_groups(id) on delete cascade,
  ticker text,
  name text not null default '새 종목',
  target_pct_in_group numeric not null default 0 check (target_pct_in_group between 0 and 100),
  qty numeric not null default 0 check (qty >= 0),
  avg_price numeric not null default 0 check (avg_price >= 0),
  account text,
  region text not null default '국내' check (region in ('국내', '해외')),
  memo text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Deliberately no current_price/price_updated_at columns: current price is
-- always a derived, live value fetched from Toss at read time (see
-- lib/calc/rebalance.ts + hooks/useLivePrices.ts), never persisted.

create index if not exists holdings_user_group_idx on holdings (user_id, group_id);
create index if not exists asset_groups_user_idx on asset_groups (user_id);

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

-- holdings: must own the row AND own the group it points to (blocks cross-user group_id insertion)
drop policy if exists "own holdings" on holdings;
create policy "own holdings" on holdings
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and group_id in (select id from asset_groups where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 매매일지 (trading journal) — ADR-0027 ~ 0032
-- ---------------------------------------------------------------------------

-- Tax rate lookup needs the exact market (KOSPI vs KOSDAQ) and whether the
-- holding is an ETF (국내 ETF는 매도 시 증권거래세 면제 — ADR-0028). `region`
-- alone can't answer either, so holdings carries both. Nullable market falls
-- back to a region-based default so existing rows stay valid.
alter table holdings add column if not exists market text
  check (market is null or market in ('KOSPI', 'KOSDAQ', 'KONEX', 'KOTC', 'NASDAQ', 'NYSE', 'AMEX'));
alter table holdings add column if not exists asset_type text not null default 'STOCK'
  check (asset_type in ('STOCK', 'ETF', 'ETN', 'REIT', 'FUND', 'CASH'));

-- The execution ledger. Single write path for 보유수량/평균매입가 (ADR-0027):
-- holdings.qty / holdings.avg_price are a materialized replay of these rows,
-- never edited independently. A holding's pre-journal balance lives here too,
-- as one intent='OPENING_BALANCE' row.
create table if not exists executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  holding_id uuid not null references holdings(id) on delete cascade,
  side text not null check (side in ('BUY', 'SELL')),
  intent text not null default 'NEW' check (
    intent in ('OPENING_BALANCE', 'NEW', 'ADD', 'SCALE_OUT', 'EXIT', 'STOP_LOSS', 'REBALANCE', 'CORPORATE_ACTION')
  ),
  executed_at timestamptz not null,
  qty numeric not null check (qty > 0),
  /** In the holding's native currency (KRW for 국내, USD for 해외). */
  price numeric not null check (price >= 0),
  /** Native → KRW, frozen at execution time (ADR-0029). '1' for KRW holdings. */
  fx_rate numeric not null default 1 check (fx_rate > 0),
  -- Derived at save time and snapshotted, so a later rate change can't rewrite
  -- past 실현손익 (ADR-0028).
  fee_amount numeric not null default 0 check (fee_amount >= 0),
  tax_amount numeric not null default 0 check (tax_amount >= 0),
  applied_fee_rate numeric not null default 0 check (applied_fee_rate >= 0),
  applied_tax_rate numeric not null default 0 check (applied_tax_rate >= 0),
  /** true once the user overrode the derived fee/tax by hand. */
  cost_overridden boolean not null default false,
  /** soft delete — physical deletes would make past 실현손익 unexplainable (ADR-0032). */
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

-- Qualitative record, deliberately NOT columns on executions: a position built
-- from three buys has one 라지, not three (ADR-0031).
create table if not exists trade_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('EXECUTION', 'POSITION', 'DAY')),
  /** executionId | holdingId | 'YYYY-MM-DD' — see lib/journal/noteTarget.ts. */
  target_key text not null,
  setup_tags text[] not null default '{}',
  emotion_tags text[] not null default '{}',
  exit_reason text check (
    exit_reason is null
    or exit_reason in ('THESIS_MET', 'THESIS_BROKEN', 'REBALANCE', 'STOP_HIT', 'EMOTIONAL')
  ),
  followed_plan boolean,
  /** 라지가 무효화되는 조건. POSITION 노트의 핵심 필드. */
  invalidation_condition text,
  stop_price numeric check (stop_price is null or stop_price >= 0),
  target_price numeric check (target_price is null or target_price >= 0),
  /** 자유 서술 — 어떤 집계에도 쓰이지 않는다 (ADR-0031). */
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists trade_notes_target_idx
  on trade_notes (user_id, target_type, target_key);

-- Per-account 위탁수수료율. No row means the app-wide default applies, so this
-- table only ever holds explicit overrides (ADR-0028).
create table if not exists account_fee_rates (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account text not null,
  domestic_fee_rate numeric not null default 0.00015 check (domestic_fee_rate >= 0),
  overseas_fee_rate numeric not null default 0.0007 check (overseas_fee_rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, account)
);

drop trigger if exists executions_set_updated_at on executions;
create trigger executions_set_updated_at
  before update on executions
  for each row execute function set_updated_at();

drop trigger if exists trade_notes_set_updated_at on trade_notes;
create trigger trade_notes_set_updated_at
  before update on trade_notes
  for each row execute function set_updated_at();

drop trigger if exists account_fee_rates_set_updated_at on account_fee_rates;
create trigger account_fee_rates_set_updated_at
  before update on account_fee_rates
  for each row execute function set_updated_at();

alter table executions enable row level security;
alter table trade_notes enable row level security;
alter table account_fee_rates enable row level security;

-- executions: own the row AND own the holding it points to.
drop policy if exists "own executions" on executions;
create policy "own executions" on executions
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and holding_id in (select id from holdings where user_id = auth.uid())
  );

drop policy if exists "own trade notes" on trade_notes;
create policy "own trade notes" on trade_notes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own account fee rates" on account_fee_rates;
create policy "own account fee rates" on account_fee_rates
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Migration: absorb each existing holding's balance as an OPENING_BALANCE
-- execution (PRD §4 F-7). Idempotent — skips holdings that already have one.
-- Run once, after the tables above exist.
-- ---------------------------------------------------------------------------
insert into executions (user_id, holding_id, side, intent, executed_at, qty, price, fx_rate)
select h.user_id, h.id, 'BUY', 'OPENING_BALANCE', h.created_at, h.qty, h.avg_price, 1
from holdings h
where h.qty > 0
  and not exists (
    select 1 from executions e
    where e.holding_id = h.id and e.intent = 'OPENING_BALANCE' and e.deleted_at is null
  );
