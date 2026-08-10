-- PowerSync ↔ Supabase replication setup.
--
-- Run once, on a DIRECT Postgres connection (Supabase dashboard → SQL
-- editor, or psql on the direct connection string). This is DDL and role
-- management, so it can't go through PostgREST with the anon/service keys
-- in .env.local.
--
-- This is not an app migration — it provisions replication access for the
-- PowerSync service and is intentionally kept out of supabase/migrations/.

-- ── 1. Replication role ──────────────────────────────────────────────────
--
-- BYPASSRLS is required: PowerSync replicates the whole table and applies
-- per-user filtering itself via sync rules (powersync/sync-rules.yaml).
-- Row-level isolation for synced clients is enforced there, and on write
-- by the app's own RLS, which still applies because uploadData() goes back
-- through PostgREST as the signed-in user.
--
-- Created NOLOGIN on purpose. A BYPASSRLS role that can log in with a
-- password committed to the repo is a backdoor into every table, so the
-- role cannot authenticate at all until you run the ALTER below with a
-- password you generate yourself. Do not commit that value — put it
-- straight into your password manager; the PowerSync dashboard needs it
-- once, at connection setup.

CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS NOLOGIN;

-- Run this separately, substituting a generated password:
--   ALTER ROLE powersync_role WITH LOGIN PASSWORD '<generated-password>';

-- Grants are table-scoped to match the publication below, NOT
-- `ON ALL TABLES`. The publication already excludes biometric_devices
-- (webhook secrets), payroll_exports and notifications; granting SELECT on
-- everything would have handed them over anyway to a role that also
-- bypasses RLS.
GRANT USAGE ON SCHEMA public TO powersync_role;
GRANT SELECT ON
  public.employees,
  public.sites,
  public.shifts,
  public.attendance_events
TO powersync_role;

-- Deliberately no ALTER DEFAULT PRIVILEGES: a table added later must be
-- granted here explicitly, next to the publication change below, so the
-- two lists can't silently drift apart.

-- ── 2. Publication ───────────────────────────────────────────────────────
--
-- Scoped to the four tables in the sync rules rather than FOR ALL TABLES.
-- Narrower is better here: it keeps `payroll_exports`, `biometric_devices`
-- (which holds webhook secrets) and `notifications` out of the replication
-- stream entirely, rather than relying on sync rules alone to exclude them.
--
-- Adding a table to the sync rules later means adding it here too.

CREATE PUBLICATION powersync FOR TABLE
  public.employees,
  public.sites,
  public.shifts,
  public.attendance_events;

-- ── 3. Dashboard steps (not SQL) ─────────────────────────────────────────
--
--  a. PowerSync dashboard → create an instance.
--  b. Connect it to this database: use the Supabase DIRECT connection
--     string (not the pooler), swapping in powersync_role and the password
--     from step 1. SSL mode: verify-full.
--  c. Tick "Use Supabase Auth" so PowerSync validates the Supabase session
--     JWT the client already holds.
--  d. Paste powersync/sync-rules.yaml, Validate, then Deploy.
--  e. Copy the instance URL into .env.local as NEXT_PUBLIC_POWERSYNC_URL.
--
-- Until (e) is set, the app runs online-only: PowerSyncProvider renders
-- children untouched and the existing server-action write path is used.
