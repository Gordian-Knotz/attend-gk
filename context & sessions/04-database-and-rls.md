# 04 — Database & RLS

Why the two schemas couldn't be reconciled, the security bugs found in each,
and what the two new migrations do.

## The two data models

### v1

```
organizations (id, name, created_at)
sites         (id, org_id, name, location text, created_at)
profiles      (id → auth.users, org_id, site_id, full_name, email, role)
attendance_records (id, org_id, site_id, staff_id,
                    clock_in timestamptz, clock_out timestamptz,
                    status, method text)
leave_requests     (id, org_id, site_id, staff_id, leave_type,
                    start_date, end_date, status)
notifications      (id, org_id, site_id, message, created_at)
```

Enums: `user_role`, `attendance_status ('on_time','late','absent','no_show')`,
`leave_status`.

A trigger on `auth.users` auto-creates a `profiles` row on signup.

### v2

```
organizations (id, name, slug unique, plan_tier, billing_status, created_at)
sites         (id, org_id, name,
               geofence_lat, geofence_lng, geofence_radius_m)
employees     (id → auth.users, org_id, site_id, full_name,
               role, employment_type, pay_rate)
shifts        (id, site_id, employee_id, start_at, end_at, status)
biometric_devices (id, org_id, site_id, device_id, model,
                   last_seen_at, webhook_secret)
attendance_events (id, employee_id, org_id, site_id, device_id,
                   source, event_type check ('check_in','check_out'),
                   occurred_at, received_at,
                   gps_lat, gps_lng, distance_m)
attendance_summary (id, employee_id, org_id, date,
                    hours_worked, overtime_hours, status,
                    unique(employee_id, date))
leave_requests     (id, employee_id, org_id, leave_type,
                    start_date, end_date, status)
payroll_exports    (id, org_id, period_start, period_end, format)
```

Enums: `employee_role`, `attendance_source ('mobile','biometric','kiosk_qr','manual')`,
`attendance_status ('present','late','absent','on_leave','half_day')`,
`plan_tier`.

No signup trigger — onboarding goes through
`create_organization_for_self` (migration 0002) instead, which creates org +
default site + employee row atomically.

## Why they can't be merged

Three of these are structural, not cosmetic:

**1. `profiles` vs `employees`.** Different column sets — `employees` has
`employment_type` and `pay_rate` and requires `full_name`; `profiles`
carries `email` (duplicating `auth.users`) and allows a null org. Every
query, policy and helper in each codebase names one or the other.

**2. `attendance_records` vs `attendance_events` — the important one.**

v1 stores one row per employee per day with `clock_in` and `clock_out`
columns. v2 stores one row per punch, event-sourced, with two distinct
timestamps:

- `occurred_at` — when the event actually happened on the device.
  Client-authoritative.
- `received_at` — when the server first saw it. May be hours later if the
  device queued while offline.

The offline queue is the whole reason. A guard clocking in at a site with no
signal gets `occurred_at = 06:58` even though the row lands at 14:20 when
their phone reconnects. v1's flat model has nowhere to put that distinction
— it would record the reconnect time, or overwrite. **v1's schema cannot
represent the product's core feature correctly.** That single fact settled
the merge direction.

Event-sourcing also gives you `gps_lat/lng` and `distance_m` per punch —
an audit trail v1's model has no room for.

**3. Geofencing.** v2's `sites` carries `geofence_lat`, `geofence_lng`,
`geofence_radius_m`. v1's has `location text`. There's no migration from a
free-text location to coordinates.

Beyond those: v2 has `shifts`, `attendance_summary`, `biometric_devices` and
`payroll_exports` with no v1 counterpart, and richer `organizations`
(`slug`, `plan_tier`, `billing_status`). v1 has `notifications`, with no v2
counterpart — which is why that one got ported.

## Security findings

### In v1 — a cross-tenant write hole

```sql
create policy "attendance write" on attendance_records for insert
  with check (org_id = public.current_org_id());
```

The check is on `org_id` only. Nothing constrains `staff_id`. **Any
authenticated user could insert attendance records for any colleague in
their organization** — buddy punching, straight through the API, no UI
needed.

v2's equivalent is `with check (employee_id = auth.uid())`. Same for leave:
v1's `"leave write"` has the identical gap, letting anyone file leave in a
colleague's name.

This is the second reason v1's RLS wasn't carried over.

### Also in v1 — a shadowed built-in

v1 defines `public.current_role()`. Postgres has a built-in `current_role`.
Schema-qualifying it works, but it's a name collision waiting to confuse
someone, and any unqualified call resolves to the built-in silently.

### In v2 — already found and fixed before this session

Migrations 0003 and 0004 document real bugs the v2 author caught:

- **0003:** `super_admin` was scoped to its own `org_id` on most tables,
  same as `org_admin` — contradicting the spec's "full platform access". And
  the `org_admin` "manage" policies on `shifts`, `attendance_summary`,
  `biometric_devices` and `payroll_exports` had **no `org_id` check at all**
  — a genuine cross-tenant write bug on four tables.
- **0004:** 0003 gave shift-write access to org_admin/super_admin only,
  leaving managers out despite the spec giving them "build/edit shifts for
  their site". Added, site-scoped.

### Found during this session — migration 0005

Building `/admin/organizations` surfaced an inconsistency 0003 left behind.
It rewrote `"sites: admins manage"` to allow `super_admin` cross-org, but
never touched `"sites: select in org"` from 0001:

```sql
-- 0001, still in force before 0005
create policy "sites: select in org" on sites for select
  using (org_id = (select org_id from public.current_employee()));
```

So a `super_admin` could **write** rows on another org's sites but not
**read** them. The platform overview's site counts would have silently
returned only their own org's sites.

`0005_super_admin_site_read.sql` brings the select policy in line:

```sql
drop policy "sites: select in org" on sites;
create policy "sites: select in org" on sites for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or org_id = (select org_id from public.current_employee())
  );
```

## `0006_notifications.sql`

v1's `notifications` table, rebuilt in v2's idiom.

Changes from v1's version:

- RLS keys off `public.current_employee()`, v2's `SECURITY DEFINER` helper,
  rather than v1's `current_org_id()` / `current_role()` pair.
- Added `level text check (level in ('info','warning','critical'))`, so the
  UI can rank notices instead of rendering a flat list. v1 had message only.
- Added `idx_notifications_org on (org_id, created_at desc)` — the panel
  always reads newest-first within an org.
- Write access included from the start. v1's table was read-only with
  nothing writing to it.

The write policy mirrors the manager split introduced in 0004:

| Role | Can post |
|---|---|
| `super_admin` | anywhere |
| `org_admin` | anywhere in their org, site-scoped or org-wide |
| `manager` | their own site only (`site_id` must equal theirs) |
| `staff` | no |

Read is org-wide for everyone in the org, plus `super_admin` across all.

## Found 10 Aug 2026 — 0007's geofence is bypassable by the client

**This one matters, because 0007 exists specifically to close a hole.**
[08](08-powersync-offline.md) explains the reasoning: PowerSync writes go
local SQLite → `uploadData()` → PostgREST, never touching the
`recordAttendance` server action, so the geofence had to move into a
`BEFORE INSERT` trigger to cover every write path.

The trigger is fine. The policy underneath it isn't. From 0001, unchanged:

```sql
create policy "attendance: self insert" on attendance_events for insert
  with check (employee_id = auth.uid());
```

`source`, `site_id` and `org_id` are all client-supplied and unconstrained —
and two of them are exactly what the trigger branches on:

| Client sends | Trigger behaviour | Result |
|---|---|---|
| `source = 'biometric'` or `'manual'` | exempt branch, returns immediately | geofence skipped entirely |
| `site_id = null` | "nothing to measure against", returns | geofence skipped entirely |
| another org's `org_id` | never examined | punch lands in that org's reports |

So a staff user who can reach PostgREST — which is every signed-in user —
can write an out-of-fence punch by setting one field. The exemptions are
correct in intent (a fixed terminal has no GPS; an admin correction has no
GPS) but they're being decided by the least trustworthy party.

**This is the same bug as v1's, mirrored.** Above, v1's failure is *"the
check is on `org_id` only. Nothing constrains `staff_id`."* Here the check is
on `employee_id` only, and nothing constrains the three fields the
enforcement path depends on.

Fix, sketched as `0008_attendance_insert_integrity.sql` in
[10](10-live-db-bringup.md) §1:

1. Constrain the staff insert policy so `org_id` and `site_id` must match
   the caller's own `current_employee()` row, and `source` must be in
   `('mobile', 'kiosk_qr')`.
2. Leave `('manual', 'biometric')` to the admin/manager policies and the
   service role, which is where the webhook bridge will live.
3. In the trigger, make `site_id is null` a rejection for GPS-bearing
   sources rather than a pass — an assigned employee always has a site.

Then the exemptions become unreachable from a staff client and 0007 does
what it was written to do.

**Until that's done, treat the geofence as unenforced and don't set
`NEXT_PUBLIC_POWERSYNC_URL`.** PowerSync is inert without it, so the exposure
today is limited to a hand-crafted PostgREST call; turning sync on is what
makes it the normal write path.

## Migration order

```
0001_init_schema.sql            schema + RLS
0002_self_serve_signup.sql      create_organization_for_self RPC
0003_fix_super_admin_scope.sql  RLS fixes
0004_manager_shift_access.sql   manager shift writes
0005_super_admin_site_read.sql  RLS fix        ← 6 Aug session
0006_notifications.sql          notices        ← 6 Aug session
0007_geofence_enforcement.sql   geofence trigger  ← 6 Aug session, unrun
0008_…_insert_integrity.sql     not written yet — see above
seed.sql                        demo org, site, notices  ← run last
```

`seed.sql` now inserts into `notifications`, so it must run after 0006. Its
header comment previously said "run after 0001" — corrected.

## Untested

Neither new migration has been run against a live Postgres. They're
syntactically consistent with the four that precede them and follow the same
policy idiom, but **they have not been executed**. Run them on a scratch
project before production. See [06](06-next-steps.md).
