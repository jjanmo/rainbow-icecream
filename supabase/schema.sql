-- Rainbow Icecream portfolio manager schema.
-- Apply this in your Supabase project's SQL editor. Not run automatically.

create extension if not exists "pgcrypto";

create table if not exists asset_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  target_pct numeric not null default 0 check (target_pct between 0 and 100),
  flavor_index int not null default 0 check (flavor_index between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
