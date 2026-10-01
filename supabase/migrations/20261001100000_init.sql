-- PaidTwice initial schema.
-- Principles: RLS on every table; users can only read their own rows; anything that
-- grants access (entitlements, billing) is written only by the service role from
-- edge functions; security-definer functions pin search_path and are not exposed to anon.

-- ---------------------------------------------------------------------------
-- Profiles

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text check (char_length(full_name) <= 200),
  company text check (char_length(company) <= 200),
  country text check (char_length(country) <= 100),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, company, country) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Entitlements (written only by the billing webhook or an admin)

create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pass_until timestamptz,
  pro_until timestamptz,
  pro_status text,
  paddle_customer_id text,
  paddle_subscription_id text,
  note text,
  updated_at timestamptz not null default now()
);
alter table public.entitlements enable row level security;

create policy "entitlements: read own" on public.entitlements
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;

create or replace function public.current_plan()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when e.pro_until is not null and e.pro_until > now() then 'pro'
        when e.pass_until is not null and e.pass_until > now() then 'pass'
        else 'free'
      end
      from public.entitlements e
      where e.user_id = auth.uid()
    ),
    'free'
  );
$$;

create or replace function public.has_paid_plan()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_plan() in ('pro', 'pass');
$$;

revoke execute on function public.current_plan() from public, anon;
revoke execute on function public.has_paid_plan() from public, anon;
grant execute on function public.current_plan() to authenticated;
grant execute on function public.has_paid_plan() to authenticated;

-- New users get a profile and an (empty) entitlement row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, company)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(left(new.raw_user_meta_data ->> 'full_name', 200), ''),
    nullif(left(new.raw_user_meta_data ->> 'company', 200), '')
  )
  on conflict (id) do nothing;
  insert into public.entitlements (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Saved audits and their findings (paid plans only)

create table public.audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  file_name text check (char_length(file_name) <= 300),
  rows_scanned integer not null default 0 check (rows_scanned >= 0),
  currency text check (char_length(currency) <= 3),
  scanned_cents bigint,
  exposure_cents bigint,
  high_exposure_cents bigint,
  finding_count integer not null default 0 check (finding_count >= 0),
  period_start date,
  period_end date,
  stats jsonb not null default '{}'::jsonb check (octet_length(stats::text) <= 20000),
  settings jsonb not null default '{}'::jsonb check (octet_length(settings::text) <= 5000),
  created_at timestamptz not null default now()
);
create index audits_user_created_idx on public.audits (user_id, created_at desc);
alter table public.audits enable row level security;

create policy "audits: read own" on public.audits
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "audits: insert own on a paid plan" on public.audits
  for insert to authenticated with check ((select auth.uid()) = user_id and (select public.has_paid_plan()));
create policy "audits: rename own" on public.audits
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "audits: delete own" on public.audits
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.audits from anon, authenticated;
grant select, insert, delete on public.audits to authenticated;
grant update (name) on public.audits to authenticated;

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  finding_key text not null check (char_length(finding_key) <= 64),
  test text not null check (char_length(test) <= 32),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  score real not null,
  vendor text check (char_length(vendor) <= 300),
  currency text check (char_length(currency) <= 3),
  amount_cents bigint not null default 0,
  exposure_cents bigint not null default 0,
  reversed boolean not null default false,
  reasons jsonb not null default '[]'::jsonb check (octet_length(reasons::text) <= 10000),
  rows jsonb not null default '[]'::jsonb check (octet_length(rows::text) <= 100000),
  status text not null default 'open' check (status in ('open', 'confirmed', 'not_duplicate', 'recovered')),
  recovered_cents bigint check (recovered_cents is null or recovered_cents >= 0),
  note text check (char_length(note) <= 2000),
  updated_at timestamptz not null default now(),
  unique (audit_id, finding_key)
);
create index findings_audit_idx on public.findings (audit_id);
create index findings_user_idx on public.findings (user_id);
alter table public.findings enable row level security;

create policy "findings: read own" on public.findings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "findings: insert own on a paid plan" on public.findings
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (select public.has_paid_plan())
    and exists (select 1 from public.audits a where a.id = audit_id and a.user_id = (select auth.uid()))
  );
create policy "findings: update own" on public.findings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.findings from anon, authenticated;
grant select, insert on public.findings to authenticated;
grant update (status, recovered_cents, note) on public.findings to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

create trigger findings_touch before update on public.findings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Sales leads, billing events and rate limits: service role only

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) <= 320),
  name text check (char_length(name) <= 200),
  company text check (char_length(company) <= 200),
  country text check (char_length(country) <= 100),
  topic text check (char_length(topic) <= 100),
  message text check (char_length(message) <= 5000),
  source text check (char_length(source) <= 200),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

create table public.billing_events (
  event_id text primary key,
  event_type text not null,
  occurred_at timestamptz,
  user_id uuid,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

create table public.rate_limits (
  id bigserial primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index rate_limits_bucket_idx on public.rate_limits (bucket, created_at desc);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.hit_rate_limit(p_bucket text, p_max integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if random() < 0.05 then
    delete from public.rate_limits where created_at < now() - interval '2 days';
  end if;
  select count(*) into n from public.rate_limits
    where bucket = p_bucket and created_at > now() - p_window;
  if n >= p_max then
    return false;
  end if;
  insert into public.rate_limits (bucket) values (p_bucket);
  return true;
end;
$$;
revoke execute on function public.hit_rate_limit(text, integer, interval) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, interval) to service_role;

-- ---------------------------------------------------------------------------
-- Admin: grant or revoke access by email (for customers paying by invoice).
-- Run from the SQL editor:  select public.admin_grant_plan('cfo@example.com', 'pro', 365);

create or replace function public.admin_grant_plan(p_email text, p_plan text, p_days integer default 30)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then
    raise exception 'No user with email %', p_email;
  end if;
  insert into public.entitlements (user_id) values (uid) on conflict (user_id) do nothing;
  if p_plan = 'pass' then
    update public.entitlements
      set pass_until = greatest(coalesce(pass_until, now()), now()) + make_interval(days => p_days),
          note = 'manual grant', updated_at = now()
      where user_id = uid;
  elsif p_plan = 'pro' then
    update public.entitlements
      set pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => p_days),
          pro_status = 'manual', note = 'manual grant', updated_at = now()
      where user_id = uid;
  elsif p_plan = 'free' then
    update public.entitlements
      set pass_until = null, pro_until = null, pro_status = null, note = 'manual revoke', updated_at = now()
      where user_id = uid;
  else
    raise exception 'Unknown plan %, use pass, pro or free', p_plan;
  end if;
  return 'ok';
end;
$$;
revoke execute on function public.admin_grant_plan(text, text, integer) from public, anon, authenticated;
