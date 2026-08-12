-- 0017_leave_accrual.sql
--
-- Accrual as an opt-in policy mode, not a replacement.
--
-- 'annual' is what every organization does today: the full entitlement exists
-- from 1 January. 'monthly' earns one twelfth per completed month.
--
-- The default is 'annual' precisely so that applying this migration changes
-- nothing for anybody. Unlike 0015, no number moves until an admin deliberately
-- switches a policy over.
--
-- EARNED-TO-DATE IS NOT STORED. The entitlement row keeps holding the full-year
-- figure and the balance module decides how much of it is available today.
-- Storing an accrued figure would need a scheduled job, and it would drift the
-- first time a run was missed — the same reasoning that keeps `days_taken` out
-- of the schema. It also means switching an org between modes needs no backfill
-- and rewrites no history.

begin;

alter table leave_policies
  add column if not exists accrual_mode text not null default 'annual';

alter table leave_policies drop constraint if exists leave_policies_accrual_mode_check;
alter table leave_policies add constraint leave_policies_accrual_mode_check
  check (accrual_mode in ('annual', 'monthly'));

comment on column leave_policies.accrual_mode is
  'annual: full entitlement from 1 January. monthly: annual_days/12 per completed month. Earned-to-date is computed at read time, never stored.';

commit;

notify pgrst, 'reload schema';
