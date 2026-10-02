-- Keep plan helpers out of the exposed API schema (no /rpc endpoint), while RLS policies can still call them.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_plan()
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

create or replace function private.has_paid_plan()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_plan() in ('pro', 'pass');
$$;

revoke execute on function private.current_plan() from public, anon;
revoke execute on function private.has_paid_plan() from public, anon;
grant execute on function private.current_plan() to authenticated, service_role;
grant execute on function private.has_paid_plan() to authenticated, service_role;

drop policy "audits: insert own on a paid plan" on public.audits;
create policy "audits: insert own on a paid plan" on public.audits
  for insert to authenticated with check ((select auth.uid()) = user_id and (select private.has_paid_plan()));

drop policy "findings: insert own on a paid plan" on public.findings;
create policy "findings: insert own on a paid plan" on public.findings
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (select private.has_paid_plan())
    and exists (select 1 from public.audits a where a.id = audit_id and a.user_id = (select auth.uid()))
  );

drop function public.has_paid_plan();
drop function public.current_plan();

create index if not exists leads_user_idx on public.leads (user_id);
