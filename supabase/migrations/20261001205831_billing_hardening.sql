-- Billing hardening (Paddle Billing).
-- 1. Events are stored and applied in one transaction, so a failed update is retried by Paddle
--    instead of being swallowed by the idempotency check.
-- 2. Pro changes are ordered by the event's occurred_at; late, older events are ignored.
-- 3. Each transaction grants access once (no double Audit Pass from transaction.paid + completed).
-- 4. Approved full refunds and chargebacks take the access back, even if they arrive before the
--    payment event (a "tombstone" grant row blocks the late grant).

alter table public.entitlements
  add column if not exists pro_event_at timestamptz,
  add column if not exists pro_cancel_at timestamptz;

create table if not exists public.billing_grants (
  transaction_id text primary key check (char_length(transaction_id) <= 100),
  user_id uuid references auth.users(id) on delete cascade,
  plan text check (plan in ('pass', 'pro')),
  days integer check (days is null or days between 1 and 3660),
  subscription_id text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text
);
create index if not exists billing_grants_user_idx on public.billing_grants (user_id);
alter table public.billing_grants enable row level security;
revoke all on public.billing_grants from anon, authenticated;

create index if not exists entitlements_customer_idx on public.entitlements (paddle_customer_id);
create index if not exists entitlements_subscription_idx on public.entitlements (paddle_subscription_id);
create index if not exists billing_events_user_idx on public.billing_events (user_id);

-- Applies one verified Paddle event. p_action is produced by planEvent() in the edge function:
--   {"kind":"record"}
--   {"kind":"grant_pass","transactionId","days","customerId"}
--   {"kind":"pro_payment","transactionId","subscriptionId","customerId","paidThrough"}
--   {"kind":"sync_pro","subscriptionId","customerId","status","proUntil","cancelAt"}
--   {"kind":"revoke","transactionId","reason"}
create or replace function public.apply_billing_event(p_event jsonb, p_action jsonb, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id text := coalesce(p_event ->> 'event_id', p_event ->> 'notification_id');
  v_occurred timestamptz := nullif(p_event ->> 'occurred_at', '')::timestamptz;
  v_kind text := p_action ->> 'kind';
  v_txn text := p_action ->> 'transactionId';
  v_sub text := p_action ->> 'subscriptionId';
  v_cus text := p_action ->> 'customerId';
  v_user uuid := p_user_id;
  v_rows integer;
  v_grant public.billing_grants%rowtype;
  v_ent public.entitlements%rowtype;
begin
  if v_event_id is null then
    raise exception 'event without an id';
  end if;

  insert into public.billing_events (event_id, event_type, occurred_at, user_id, payload)
  values (v_event_id, coalesce(p_event ->> 'event_type', 'unknown'), v_occurred, null, p_event)
  on conflict (event_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return 'duplicate';
  end if;

  -- Find the account when the event did not carry our user id.
  if v_user is null and v_txn is not null then
    select user_id into v_user from public.billing_grants where transaction_id = v_txn;
  end if;
  if v_user is null and v_sub is not null then
    select user_id into v_user from public.entitlements where paddle_subscription_id = v_sub limit 1;
  end if;
  if v_user is null and v_cus is not null then
    select user_id into v_user from public.entitlements where paddle_customer_id = v_cus limit 1;
  end if;
  if v_user is not null and not exists (select 1 from auth.users where id = v_user) then
    v_user := null;
  end if;
  update public.billing_events set user_id = v_user where event_id = v_event_id;

  if v_kind = 'revoke' then
    select * into v_grant from public.billing_grants where transaction_id = v_txn for update;
    if not found then
      insert into public.billing_grants (transaction_id, user_id, revoked_at, revoke_reason)
      values (v_txn, v_user, now(), p_action ->> 'reason');
      return 'revoked before granted';
    end if;
    if v_grant.revoked_at is not null then
      return 'already revoked';
    end if;
    update public.billing_grants set revoked_at = now(), revoke_reason = p_action ->> 'reason' where transaction_id = v_txn;
    if v_grant.user_id is null then
      return 'revoked (no account)';
    end if;
    if v_grant.plan = 'pass' then
      update public.entitlements
        set pass_until = case
              when pass_until is not null and pass_until - make_interval(days => coalesce(v_grant.days, 30)) > now()
                then pass_until - make_interval(days => coalesce(v_grant.days, 30))
              else now()
            end,
            note = 'pass ' || coalesce(p_action ->> 'reason', 'refund'),
            updated_at = now()
        where user_id = v_grant.user_id;
    elsif v_grant.plan = 'pro' then
      update public.entitlements
        set pro_until = now(), pro_status = coalesce(p_action ->> 'reason', 'refund'), pro_event_at = greatest(coalesce(pro_event_at, v_occurred), v_occurred), updated_at = now()
        where user_id = v_grant.user_id;
    end if;
    return 'revoked';
  end if;

  if v_kind = 'record' or v_user is null then
    return case when v_user is null and v_kind <> 'record' then 'no matching account' else 'recorded' end;
  end if;

  insert into public.entitlements (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into v_ent from public.entitlements where user_id = v_user for update;
  if v_cus is not null then
    update public.entitlements set paddle_customer_id = v_cus where user_id = v_user;
  end if;

  if v_kind = 'grant_pass' then
    insert into public.billing_grants (transaction_id, user_id, plan, days)
    values (v_txn, v_user, 'pass', greatest(1, least(3660, coalesce((p_action ->> 'days')::integer, 30))))
    on conflict (transaction_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return 'already granted or refunded';
    end if;
    update public.entitlements
      set pass_until = greatest(coalesce(pass_until, now()), now())
                       + make_interval(days => greatest(1, least(3660, coalesce((p_action ->> 'days')::integer, 30)))),
          note = null,
          updated_at = now()
      where user_id = v_user;
    return 'pass granted';
  end if;

  if v_kind = 'pro_payment' then
    insert into public.billing_grants (transaction_id, user_id, plan, subscription_id)
    values (v_txn, v_user, 'pro', v_sub)
    on conflict (transaction_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return 'already granted or refunded';
    end if;
    -- A payment only ever extends access; the subscription events decide everything else.
    if nullif(p_action ->> 'paidThrough', '') is not null then
      update public.entitlements
        set pro_until = greatest(coalesce(pro_until, '-infinity'::timestamptz), (p_action ->> 'paidThrough')::timestamptz),
            paddle_subscription_id = coalesce(v_sub, paddle_subscription_id),
            pro_status = coalesce(pro_status, 'active'),
            updated_at = now()
        where user_id = v_user;
    end if;
    return 'pro payment recorded';
  end if;

  if v_kind = 'sync_pro' then
    if v_ent.pro_event_at is not null and v_occurred is not null and v_occurred <= v_ent.pro_event_at then
      return 'stale';
    end if;
    update public.entitlements
      set pro_status = p_action ->> 'status',
          pro_until = nullif(p_action ->> 'proUntil', '')::timestamptz,
          pro_cancel_at = nullif(p_action ->> 'cancelAt', '')::timestamptz,
          paddle_subscription_id = coalesce(v_sub, paddle_subscription_id),
          pro_event_at = coalesce(v_occurred, now()),
          updated_at = now()
      where user_id = v_user;
    return 'pro synced';
  end if;

  return 'ignored';
end;
$$;

revoke execute on function public.apply_billing_event(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.apply_billing_event(jsonb, jsonb, uuid) to service_role;
