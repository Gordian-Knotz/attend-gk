# 10 — Live database bring-up

Plan for taking migrations 0005/0006/0007 + seed from unexecuted SQL to
verified-against-a-real-Postgres, and for checking the three computations
[06](06-next-steps.md) flags as most likely to be subtly wrong.

Written 10 Aug 2026. Nothing in here has been executed — it is the plan, not
a record of a bring-up. Tick the boxes at the end as you go.

---

## Phase 0 — Before you run anything

### 0.1 Decide which project

`.env.local` already points at a Supabase project (URL + anon key present),
so **you may already have schema in that project**. Establish what is
actually applied before running anything:

```sql
select
  to_regclass('public.notifications') is not null                        as has_0006,
  exists (select 1 from pg_proc  where proname = 'geo_distance_m')       as has_0007_fn,
  exists (select 1 from pg_trigger where tgname = 'attendance_geofence') as has_0007_trig,
  exists (
    select 1 from pg_policies
    where tablename = 'sites'
      and policyname = 'sites: select in org'
      and qual ilike '%super_admin%'
  )                                                                      as has_0005,
  (select count(*) from organizations)                                   as orgs,
  (select count(*) from employees)                                       as employees,
  (select count(*) from attendance_events)                               as events;
```

Recommendation: run 0005–0007 on a **scratch project** first, as doc 06
says. 0007 in particular installs a trigger that can reject writes; you do
not want to discover its edge cases against data you care about.

### 0.2 Add the missing service-role key

`SUPABASE_SERVICE_ROLE_KEY` is referenced in code but absent from
`.env.local`. Without it:

- `/admin/staff` invite (`inviteUserByEmail`) fails
- `scripts/seed-demo-data.mjs` cannot create `auth.users`

Add it from Supabase → Settings → API. It is a secret with RLS bypass —
server-side only, and `.env.local` must stay gitignored (it is).

### 0.3 Clean the tree

`package-lock.json` carries a 1-line uncommitted change from an `npm
install` on 9 Aug. Commit or revert it so anything that follows is
attributable.

---

## Phase 1 — Fix the hole in 0007 before running it

**Do this before Phase 2.** Migration 0007 exists specifically to stop a
client from writing an out-of-fence punch through PowerSync. As written it
does not, because the RLS insert policy from 0001 constrains only the
employee:

```sql
create policy "attendance: self insert" on attendance_events for insert
  with check (employee_id = auth.uid());
```

`source`, `site_id` and `org_id` are all client-supplied and unchecked, and
the trigger returns `new` unchanged in two client-reachable branches:

| Client sends | Trigger behaviour | Result |
|---|---|---|
| `source = 'biometric'` (or `'manual'`) | exempt branch, returns immediately | geofence skipped entirely |
| `site_id = null` | "nothing to measure against", returns | geofence skipped entirely |
| `org_id` = another org's id | not examined at all | punch lands in another org's reports |

This is the same shape as the v1 bug doc 04 documents — *"the check is on
`org_id` only. Nothing constrains `staff_id`."* Here it is the mirror
image: the check is on `employee_id` only, and nothing constrains the three
fields the trigger's control flow depends on.

Suggested fix, as `0008_attendance_insert_integrity.sql`:

1. Tighten the insert policy so a staff-authored punch cannot lie about
   where it belongs — `org_id` and `site_id` must match the caller's own
   `current_employee()` row, and `source` must be in `('mobile','kiosk_qr')`.
2. Keep `('manual','biometric')` writable only by the admin/manager
   policies and the future webhook bridge (service role), not by staff.
3. In the trigger, treat `site_id is null` as a rejection for GPS-bearing
   sources rather than a pass, since an assigned employee always has a site.

Then the trigger's exemptions become genuinely unreachable by a staff
client, and 0007 does what it was written to do.

> If you would rather not widen scope: run 0007 as-is on the scratch
> project to validate its haversine and its error codes, but treat the
> geofence as **not yet enforced** until the policy is tightened. Do not
> turn PowerSync on before then — that is the exact path the trigger was
> meant to guard.

---

## Phase 2 — Run the migrations

In order, in the Supabase SQL editor (none of these need a direct
connection — no `CREATE ROLE`, no DDL PostgREST can't reach):

```
0005_super_admin_site_read.sql
0006_notifications.sql
0007_geofence_enforcement.sql
(0008 from Phase 1, if you take it)
seed.sql                        ← must be last; it inserts notifications
```

`supabase/powersync-setup.sql` is **not** part of this phase. It creates a
replication role and a publication, needs a direct Postgres connection, and
belongs to the PowerSync bring-up.

After each: re-run the Phase 0.1 probe and confirm the flag flipped.

### Attach an admin account

`seed.sql` creates the org and site but no employee row. Then:

1. Sign up via `/login?mode=sign-up`. You will be routed to `/onboarding` —
   ignore it.
2. Run `supabase/setup-admin.sql`. **Note it is hardcoded to
   `imranissa0@gmail.com`** — change the email on line 21 and the name on
   lines 41/46 if that is not your account. Its header also says "after
   0001–0003", which predates 0005/0006; run it after `seed.sql` regardless.

---

## Phase 3 — Verify the three risky computations

Doc 06 names these as the parts a screenshot won't reveal. Each needs
fixture events with known timestamps, then a hand-computed expectation.

Seeded site: `22222222-…-2222`, geofence `-1.21730, 36.87840`, radius 150 m.
Org: `11111111-…-1111`.

### 3.1 Day bucketing — `localDateKey`

The bug this guards against: `toISOString().slice(0,10)` buckets by UTC, so
for a Nairobi admin (UTC+3) any punch before 03:00 local lands in the
previous day.

Insert a punch at **01:30 local** and one at **23:30 local** on the same
local date, then load `/admin`. Both must appear in the same day's bar on
the trend chart. If the early one falls into yesterday, `localDateKey` is
not being applied on that path.

Insert with the service role (bypasses RLS and, if you left the trigger
untightened, set `source = 'manual'` to skip the geofence for pure
bucketing tests):

```sql
insert into attendance_events
  (employee_id, org_id, site_id, source, event_type, occurred_at, received_at)
values
  ('<your-uuid>', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'manual', 'check_in',
   (current_date + time '01:30') at time zone 'Africa/Nairobi', now());
```

### 3.2 Check-in / check-out pairing — `buildTimesheet`

Four cases, one employee-day each. Expected behaviour is documented in
`src/lib/timesheet.ts`:

| Fixture | Expected hours | Expected day status |
|---|---|---|
| check_in 07:00, check_out 16:00 | 9.0 | present |
| check_in 07:00, no check_out | **0** | present |
| check_in 07:00, check_out 12:00, check_in 13:00, check_out 17:00 | 9.0 | present |
| check_out 16:00 with no preceding check_in | 0, event skipped | not present |

The second row is the deliberate one — unmatched events are skipped, not
guessed, so hours read **low** where staff forget to clock out. Confirm
`/admin/reports` and the exported CSV agree with each other on all four;
they derive from one `rows` array, so a disagreement means that invariant
broke.

### 3.3 Absent arithmetic + the 9 AM exemption

`absent = workforce − checkedIn − onLeave`, floored at zero, and **today is
exempt from absent-counting before 09:00**.

- Before 09:00 local with no punches: "Absent" tile must read `0`, and the
  `Callout` explaining the cutoff must be visible.
- After 09:00 with no punches: "Absent" must equal headcount.
- One employee on approved leave overlapping today: they count in
  `onLeave`, not `absent`, and the two must not double-count.
- Only the **earliest** check-in per employee per day counts, so a
  check-out-then-back-in must not inflate "Present".

Then confirm the same numbers on the trend chart's last bucket — `/admin`
and `buildDailySeries` must not disagree about today.

### 3.4 Known-wrong-by-design — confirm, don't chase

Three results will look wrong and are documented as such. Verify they
behave as documented rather than trying to fix them here:

- **Today's roster is applied across the whole window.** A hire from last
  week reads as absent on days before they joined. Needs employment
  start/end dates on `employees` — a schema change.
- **"Late" is a fixed 07:15 org-wide** (`src/lib/attendance.ts`), not
  per-shift, even though `shifts` is populated.
- **Unmatched check-ins contribute 0 hours** (3.2 above).

---

## Phase 4 — Feature paths that only work live

### 4.1 `/admin/organizations` as a real `super_admin`

The only consumer of migration 0005. Promote an account:

```sql
update employees set role = 'super_admin' where id = '<uuid>';
```

Confirm: the "Platform" sidebar group appears; every org is listed with
site counts. **Site counts are the actual test of 0005** — before it, a
super_admin could write another org's sites but not read them, so counts
would silently show only their own org. Cross-check against
`select count(*) from sites` as service role.

### 4.2 Geofence trigger behaviour (0007)

As an ordinary authenticated staff user, not service role:

| Insert | Expected |
|---|---|
| `mobile`, coords ~50 m from site | accepted; `distance_m` **recomputed** by the trigger |
| `mobile`, coords 5 km away | rejected, SQLSTATE **23514** |
| `mobile`, `gps_lat`/`gps_lng` null | rejected, 23514 |
| `mobile`, deliberately wrong `distance_m: 1` but coords 5 km away | rejected — the client value must be ignored |
| `manual` / `biometric`, no coords | accepted (documented exemption) |

The 23514 code matters beyond the error message: `SupabaseConnector` treats
it as permanently fatal and **drops** the queued write instead of retrying,
so a rejected punch can't wedge the queue behind it. Getting a different
code here would mean retry-forever once PowerSync is live.

If you took Phase 1, also confirm a staff client can no longer bypass by
sending `source: 'biometric'` or `site_id: null`.

### 4.3 Password reset round trip

Needs SMTP configured on the project (Auth → Emails); the default shared
sender is heavily rate-limited. Doc 03 calls the recovery-code exchange in
`/reset-password` the least-exercised path in the merge. Walk it end to
end: `/login` → "Forgot password?" → email → `/reset-password` → set →
confirm you land on `/login` **signed out**, then sign in with the new
password. Also check an expired/reused link shows the expired state rather
than a blank form.

### 4.4 Staff invite

Needs 0.2's service-role key. `/admin/staff` → invite → confirm the email
arrives and the `employees` upsert linked the new `auth.users` row to the
right org and site.

---

## Verification summary

Bring-up is done when:

- [ ] Phase 0.1 probe reports all four flags true
- [ ] `seed.sql` ran after 0006; two notices visible on `/admin`
- [ ] 3.1 — a 01:30 punch buckets to today, not yesterday
- [ ] 3.2 — all four pairing cases match the table; CSV agrees with the screen
- [ ] 3.3 — absent tile reads 0 before 09:00, headcount after; leave doesn't double-count
- [ ] 4.1 — super_admin sees all orgs *with correct site counts*
- [ ] 4.2 — all five trigger cases behave, rejections are 23514
- [ ] 4.3 — reset round trip completes and ends signed out
- [ ] 4.4 — invite delivers and links the employee row

Then update [06](06-next-steps.md) — its "Not verified" section describes a
state this bring-up replaces.

**Explicitly still out of scope:** PowerSync provisioning
(`powersync-setup.sql`, sync rules, the instance URL) and the check-in
rewrite onto local SQLite. [08](08-powersync-offline.md) sequences those
after this, and the `libpowersync*.wasm` core is still missing.
