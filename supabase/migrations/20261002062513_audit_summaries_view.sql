-- Per-audit recovery totals for the dashboard. security_invoker makes the caller's row level
-- security on findings apply, so people only ever see summaries of their own audits.
-- Matches the totals on the audit page: reversed findings are left out, "confirmed" amounts
-- include findings later marked recovered.
create or replace view public.audit_summaries
with (security_invoker = true) as
select
  f.audit_id,
  (count(*) filter (where f.status = 'confirmed'))::integer as confirmed_count,
  (count(*) filter (where f.status = 'recovered'))::integer as recovered_count,
  (count(*) filter (where f.status = 'not_duplicate'))::integer as dismissed_count,
  coalesce(sum(f.recovered_cents) filter (where f.status = 'recovered'), 0)::bigint as recovered_cents,
  coalesce(sum(f.exposure_cents) filter (where f.status in ('confirmed', 'recovered')), 0)::bigint as confirmed_cents
from public.findings f
where not f.reversed
group by f.audit_id;

revoke all on public.audit_summaries from public, anon, authenticated;
grant select on public.audit_summaries to authenticated;
