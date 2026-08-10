-- Somewhere for the landing page's pilot enquiries to land.
--
-- WHY THIS EXISTS
--
-- The contact form on `/` ran a 600 ms timeout and then rendered "Request
-- received — we'll be in touch within one business day". Nothing was sent
-- anywhere. Every enquiry was discarded while the sender believed it had
-- arrived; the 10 Aug audit flagged it, and mailto: was the interim fix.
--
-- This is the real one. It also gives the rate limiter something to
-- protect: an unauthenticated insert path is exactly what gets scraped and
-- flooded, so the application caps it per IP and the constraints below cap
-- what any single row can cost.

create table if not exists contact_requests (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  work_email   text not null,
  company      text not null,
  phone        text,
  team_size    text,
  message      text,
  -- Operational context, not analytics. Useful when a burst arrives and
  -- someone has to work out whether it was one script or twenty people.
  source_ip    text,
  status       text not null default 'new'
                 check (status in ('new', 'contacted', 'closed', 'spam')),
  created_at   timestamptz not null default now(),

  -- Belt and braces against a padded payload. The server action trims and
  -- caps these too; this is the limit that holds if anything ever writes
  -- here directly.
  constraint contact_requests_lengths check (
    length(full_name)  between 1 and 120
    and length(work_email) between 3 and 254
    and length(company)    between 1 and 160
    and (phone is null   or length(phone) <= 40)
    and (team_size is null or length(team_size) <= 40)
    and (message is null or length(message) <= 2000)
  )
);

create index if not exists idx_contact_requests_created
  on contact_requests (created_at desc);

alter table contact_requests enable row level security;

-- ── Insert: anonymous, deliberately ─────────────────────────────────────
--
-- The form is on a public marketing page, so the writer has no session.
-- This is the only anon-writable table in the schema. It is safe only
-- because the row can't reference anything, can't be read back, and is
-- bounded in size by the constraint above — plus the per-IP limit in the
-- action. Do not copy this policy onto a table that joins to tenant data.

drop policy if exists "contact: anyone may submit" on contact_requests;
create policy "contact: anyone may submit" on contact_requests for insert
  to anon, authenticated
  with check (status = 'new');

-- ── Read and manage: PAC's own operators only ───────────────────────────
--
-- These are leads for the platform vendor, not tenant data. No org_id, and
-- no org_admin should ever see them.

drop policy if exists "contact: super admin reads" on contact_requests;
create policy "contact: super admin reads" on contact_requests for select
  using ((select role from public.current_employee()) = 'super_admin');

drop policy if exists "contact: super admin manages" on contact_requests;
create policy "contact: super admin manages" on contact_requests for update
  using ((select role from public.current_employee()) = 'super_admin')
  with check ((select role from public.current_employee()) = 'super_admin');

-- PostgREST caches the schema and does not notice DDL on its own.
notify pgrst, 'reload schema';
