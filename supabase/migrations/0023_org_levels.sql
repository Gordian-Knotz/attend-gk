-- 0023 — Per-organization hierarchy: the rank ladder.
--
-- WHY THIS EXISTS
--
-- Every tenant is forced into the same four-tier shape, because employee_role
-- (0001) is both the access ceiling AND the only description of structure the
-- product has. Real organizations differ: CEO → Head of Department →
-- Supervisor → Staff, or CEO → COO → Supervisor → Staff, or just Owner +
-- Staff.
--
-- And one case is actively wrong today: at a SINGLE-SITE company, a Head of
-- Department given 'manager' sees the ENTIRE organization, because manager
-- scoping is site scoping and there is only one site.
--
-- THREE INDEPENDENT AXES, deliberately not merged into one tree
--
--   access tier    employees.role      — unchanged, still the hard ceiling
--   rank           org_levels.rank     — an ordered ladder, no parent column
--   reporting line employees.reports_to_employee_id — the tree, between PEOPLE
--
-- An earlier draft made org_levels a tree with parent_level_id. That conflates
-- rank with the org chart and breaks on the first organization where "COO" and
-- "CFO" are the same seniority in different functions — a level tree forces a
-- fake parent-child between them or duplicates the ladder per branch. The tree
-- that matters is the one between people, and reports_to_employee_id is it.
--
-- WHAT THIS MIGRATION DOES NOT DO, AND MUST NOT
--
-- It does not derive employees.role from a level. Postgres fires BEFORE-row
-- triggers in alphabetical order by trigger name, each seeing the previous
-- one's modified NEW — so a sync trigger sorting after employees_guard_role
-- (0011) would overwrite the role AFTER the guard had validated it, reopening
-- the escalation hole 0011 exists to close. suggested_tier below is a UI
-- pre-fill and nothing more. DO NOT ADD A SYNC TRIGGER.
--
-- Consequently this migration adds NO trigger and NO new privilege path:
--
--   * the tier stays the hard ceiling, still guarded by 0011;
--   * rank and scope can only ever SUBTRACT from what the tier grants,
--     because narrowing (a later piece) uses restrictive policies, which
--     combine with AND and cannot widen;
--   * only org_admin and above can write `employees` at all (0001/0003), so
--     staff cannot move themselves between levels.
--
-- Narrowing itself is a later piece, using CREATE POLICY ... AS RESTRICTIVE so
-- that not one of the 22 existing policies has to be rewritten.

begin;

create type visibility_scope as enum ('self', 'team', 'site', 'org');

create table org_levels (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  name             text not null,
  -- 1 = most senior. NOT unique: two levels of equal seniority is a real
  -- thing, and a unique constraint would make reordering fail mid-statement
  -- unless it were deferrable. Order by (rank, name).
  rank             smallint not null check (rank >= 0),
  -- Which of the four existing tiers the UI pre-fills when somebody is put on
  -- this level. NEVER read by RLS. super_admin refused: the vendor tier is not
  -- tenant-configurable space, which is what 0003 was about.
  suggested_tier   employee_role not null default 'staff'
                     check (suggested_tier <> 'super_admin'),
  visibility_scope visibility_scope not null default 'self',
  -- A DENY-list, not an allow-list. An allow-list means every screen shipped
  -- in future silently vanishes for every existing level; a deny-list means
  -- new screens appear by default. Keys are the sidebar NAV entries.
  hidden_sections  text[] not null default '{}',
  created_at       timestamptz not null default now(),
  constraint org_levels_name_unique unique (org_id, name),
  -- Target for the composite FK on employees below.
  constraint org_levels_id_org_key unique (id, org_id)
);

create index if not exists idx_org_levels_org on org_levels (org_id, rank);

comment on table org_levels is
  'Per-org rank ladder: the titles an organization actually uses. Ordered by rank, not a tree — the tree is employees.reports_to_employee_id.';
comment on column org_levels.suggested_tier is
  'UI pre-fill for the access picker. NOT authoritative and NOT read by any policy; employees.role remains the only thing RLS checks. See 0011 for why deriving it would be an escalation path.';
comment on column org_levels.visibility_scope is
  'How far this level sees. Can only narrow what the tier already grants; enforced later by restrictive policies, which cannot widen.';

-- ── employees: two nullable columns ──────────────────────────────────────
--
-- Null on both means today's behaviour exactly, for every employee that
-- already exists. Same discipline as 0018's employment dates.

alter table employees
  add column if not exists org_level_id uuid,
  add column if not exists reports_to_employee_id uuid;

-- Target for the composite FKs. employees.id is already the primary key, so
-- this is cheap — and it is what lets "must belong to my own organization" be
-- enforced DECLARATIVELY. This schema has reached for a trigger five times for
-- column-level rules; cross-tenant row integrity is not that problem.
alter table employees drop constraint if exists employees_id_org_key;
alter table employees add constraint employees_id_org_key unique (id, org_id);

-- on delete RESTRICT, not set null: deleting a narrow level would otherwise
-- silently WIDEN access for everyone who was on it. The settings UI must
-- therefore offer "reassign these N people, then delete".
alter table employees drop constraint if exists employees_org_level_fk;
alter table employees add constraint employees_org_level_fk
  foreign key (org_level_id, org_id) references org_levels (id, org_id)
  on delete restrict;

-- on delete SET NULL, matching notifications.author_id (0013) and
-- leave_requests.decided_by (0016): removing a manager must not delete the
-- people who reported to them.
alter table employees drop constraint if exists employees_reports_to_fk;
alter table employees add constraint employees_reports_to_fk
  foreign key (reports_to_employee_id, org_id) references employees (id, org_id)
  on delete set null;

-- Blocks self-reference only. Longer cycles (A → B → A) remain insertable, so
-- any recursive walk added later needs a `cycle` clause regardless of this.
alter table employees drop constraint if exists employees_no_self_report;
alter table employees add constraint employees_no_self_report
  check (reports_to_employee_id is distinct from id);

create index if not exists idx_employees_reports_to
  on employees (reports_to_employee_id) where reports_to_employee_id is not null;

comment on column employees.org_level_id is
  'The person''s rank. Null means unconfigured, which behaves exactly as before this migration. Does not affect access: employees.role is still the only thing RLS reads.';
comment on column employees.reports_to_employee_id is
  'Who this person reports to. The reporting tree lives here, between people — org_levels is a flat ordered ladder. Null means no specific approver, which keeps today''s role-based behaviour.';

-- ── RLS ──────────────────────────────────────────────────────────────────
--
-- Modelled on "sites: admins manage" (0001, widened 0003): everyone in the org
-- may read the ladder — staff need it to see their own title — and org_admin
-- or super_admin may write it.

alter table org_levels enable row level security;

drop policy if exists "levels: select in org" on org_levels;
create policy "levels: select in org" on org_levels for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or org_id = (select org_id from public.current_employee())
  );

drop policy if exists "levels: admins manage" on org_levels;
create policy "levels: admins manage" on org_levels for all
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
  )
  with check (
    (select role from public.current_employee()) = 'super_admin'
    or (
      (select role from public.current_employee()) = 'org_admin'
      and org_id = (select org_id from public.current_employee())
    )
  );

commit;

-- PostgREST serves a cached schema and 404s new tables until it refreshes,
-- which looks exactly like the migration not having run.
notify pgrst, 'reload schema';
