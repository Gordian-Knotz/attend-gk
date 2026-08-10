# 11 — Security hardening after the CodeRabbit audit

Session of **10 August 2026**, continuing the same day as
[09](09-v3-hero-and-bento.md). A full-codebase CodeRabbit review was run,
its 90 findings triaged, and 88 of them applied.

Branch: `harden-security-audit`, cut from `main` at `9fa2a6f`.

---

## How the review was run

CodeRabbit CLI **v0.7.2** in WSL Debian. Three things are worth recording,
because none of them are obvious and all three cost time:

1. **CodeRabbit reviews diffs, not codebases.** There is no "review
   everything" flag — `--committed`, `--uncommitted`, `--base`,
   `--base-commit` are the only scopes.
2. **`b999c72` is the root commit.** It is labelled "Baseline: attend-v2
   before v1 merge", which reads like an empty starting point, but it
   *contains all of v2*. Diffing from it would have skipped migrations
   0001–0004, every server action, and the whole original app — which is
   exactly where the serious findings turned out to be.
3. **The empty-tree trick doesn't work.** CodeRabbit shells out to
   `git diff <base>...HEAD`, and `4b825dc…` is a tree, not a commit. It also
   requires a named base *branch*, not just a commit.

What worked, and what to repeat next time:

```bash
# a throwaway snapshot whose first commit is empty, so every file is an addition
git archive HEAD | tar -x -C ~/cr-attend
cd ~/cr-attend && git init -q
git commit -q --allow-empty -m "empty base" && git branch -f base HEAD
git add -A && git commit -q -m "snapshot"
coderabbit review --agent --base base
```

142 files, 22,588 lines, 90 findings, exit 0. The real repo is untouched.

**Caveat on depth:** the throwaway repo has no git remote, so CodeRabbit
could not match it to the Gordian-Knotz organization and fell back to the
free CLI allowance — *"This review will use the free CLI allowance, even if
you're signed in."* A run against the real GitHub repo may go deeper.

Raw output: [`coderabbit-findings-10aug.md`](coderabbit-findings-10aug.md).

---

## The five criticals, and what was wrong underneath them

### 1. Any employee could read biometric webhook secrets

`0001:296` — `devices: select in org` scoped by org with **no role check**,
so a plain `staff` user could `select webhook_secret from
biometric_devices` straight off PostgREST.

This chains, which is what makes it the worst of the five: those secrets
authenticate a fixed terminal, and `source = 'biometric'` is precisely the
geofence-*exempt* branch in 0007. One roster-wide secret is enough to post
unfenced attendance for anyone.

Doc [08](08-powersync-offline.md) notes the PowerSync publication
deliberately excludes this table "which holds webhook secrets" — true of
the publication, and irrelevant to PostgREST. Being careful in one channel
read as being careful overall.

Fixed in 0008: select restricted to `org_admin`/`super_admin`. The devices
page also no longer *selects* the column at all — it rendered
`webhook_secret.slice(0, 8)`, putting eight characters of a live secret into
the page HTML for every viewer and proxy in between. It shows `Hidden` now.

> **Consequence to accept:** managers can no longer see the device list, and
> there is currently **no way to retrieve a webhook secret from the UI**.
> That is deliberate — retrieval belongs behind an explicit service-role
> action, which doesn't exist yet. Build it when the webhook bridge is
> built. Until then, read secrets with the service role directly.

### 2 & 3. Staff invite trusted its own input

`inviteStaff` runs through a **service-role client**, which bypasses RLS
entirely, so nothing downstream checks it. Three holes:

- `input.siteId` was written straight through — an org admin could attach a
  hire to **another tenant's site**.
- `input.role` was unvalidated, so the payload could ask for `org_admin` or
  `super_admin`. A server action is a public HTTP endpoint; the TypeScript
  signature is documentation, not a control.
- the `employees` upsert is keyed on the primary key, so inviting an address
  that already belonged to another org **moved that person and their
  attendance history** into the inviter's org.

All three now validated before the write, plus email format, name length,
and paginated `listUsers()` (it read only the first 50 users, so past that
it stopped finding existing accounts).

### 4. The geofence could be skipped by sending NaN

`recordAttendance` took `lat`/`lng` as `number` and passed them to
haversine. `NaN` satisfies that type, haversine returns `NaN`, and
`NaN > radius` is **false** — so an out-of-range punch was *accepted*. A
failed `sites` lookup also fell through to the insert with no check at all,
turning a transient error into a silent bypass.

### 5. The offline queue could double-count punches

If the request succeeded but the response was lost — the common case on a
flaky link, which is the entire point of the queue — the item stayed queued
and was replayed, adding a duplicate punch nothing downstream could
distinguish from a real one. There was also no in-flight guard, so the
mount-time flush and the `online` listener could replay the same items
concurrently.

---

## The one CodeRabbit missed

**`leave: self insert` let staff approve their own leave.**

`0001:290` was `with check (employee_id = auth.uid())` — `status` and
`org_id` unconstrained — and `status text not null default 'pending'` had
**no CHECK constraint**. So a staff user could POST to `leave_requests`
with `status: 'approved'`.

`/admin/page.tsx` filters on exactly `.eq("status", "approved")` to build
the on-leave count, and `absent = workforce − checkedIn − onLeave`. Marking
yourself approved therefore moves you out of "absent" and into "on leave".

**That is a second, complete attendance-fraud path that never touches the
geofence** — so 0008's geofence work alone would not have closed it. It sits
on a table nobody re-audited: 0003 tightened `leave: admins manage` and left
the insert policy alone.

Found by asking "where else does the v1 bug shape — *check on one column,
nothing constrains the rest* — appear?" That question is worth re-asking
after any RLS change.

---

## Migration 0008

`0008_attendance_insert_integrity.sql`. Written to be **re-runnable** —
every policy is `drop policy if exists` before create — so it applies
whether or not 0001–0007 are already on the target database. That mattered:
per [10](10-live-db-bringup.md) §0.1 nobody is certain what the project in
`.env.local` already has.

Six parts:

| # | What |
|---|---|
| 1 | `attendance: self insert` now pins `org_id`, `site_id` and `source` to the caller's own employee row. `manual`/`biometric` are admin/service-role only. |
| 1b | `client_event_id uuid` + partial unique index — the offline queue's idempotency key. |
| 2 | `leave: self insert` pins `org_id` and forces `status = 'pending'`; CHECK constraints on status and leave type. |
| 3 | `devices: select in org` restricted to org_admin/super_admin. |
| 4 | `summary: select` and `leave: select` rewritten to the four-tier model 0001's own header describes — staff see their own, managers their site, admins their org. They previously said "your own row **or anything in your org**", so plain staff could read every colleague's leave history and hours. |
| 5 | The trigger's `site_id is null` branch becomes a rejection, and a site with no geofence configured is rejected rather than silently passed. |

New helper `public.employee_site_id(uuid)`, `SECURITY DEFINER`, following
the `current_employee()` pattern from 0001 — reading `employees` from
inside a policy would recurse into that table's own RLS.

**0007 alone still does not enforce the geofence.** Its header now says so.
Run 0007 and 0008 together or neither.

---

## Structural changes worth knowing

### One timezone, not the server's

New `src/lib/timezone.ts`. Everything that turned a wall clock into an
instant — the 07:15 late cutoff, the 09:00 absent cutoff, day bucketing,
shift start/end, every rendered date — ran on **whatever timezone the server
process happened to be in**. Correct on a laptop in Nairobi, wrong the
moment this deploys anywhere else: the same rows would classify differently
depending on where they rendered.

`ORG_TIME_ZONE` (env-overridable, default `Africa/Nairobi`) is now the one
source. `localDateKey` reads through it, so the 01:30-punch test in
[10](10-live-db-bringup.md) §3.1 is now testing real behaviour rather than
an accident of the host.

This is **not** per-site timezones. `sites.timezone` is still the right fix
for an org spanning zones, and still needs a migration and UI — doc 06.

### Three duplicates collapsed

The audit surfaced the same pattern three times, and duplication in *these*
places is a security problem, not a tidiness one:

| Was | Now |
|---|---|
| `dashboard/actions.ts` and `checkin/actions.ts` held byte-identical copies of `recordAttendance` — including the geofence check | `src/lib/record-attendance.ts`; the actions differ only in `revalidatePath` |
| `checkin-widget.tsx` and `checkin-client.tsx` held identical offline-queue logic, differing only in JSX | `src/components/attendance/use-punch-queue.ts` |
| Three sign-out buttons, each discarding `signOut()`'s error and defaulting to `scope: 'global'` | `src/components/auth/use-sign-out.ts`, `scope: 'local'`, error surfaced |

A failed sign-out used to navigate to `/login` anyway and tell the user they
were signed out while the cookie was still live — on a shared kiosk that
hands the next person an authenticated session.

### Failed queries no longer render as empty states

`/admin`, `/admin/reports`, `/admin/organizations` and `/dashboard` all
destructured `{ data }` and dropped `error`, then fell through `?? []`. A
database outage therefore rendered as a complete, confident, **all-zero**
page — "No staff yet", every KPI zero, which reads as first-run onboarding.
Reports additionally handed those zeros to `ExportButton`, so someone could
download a timesheet understating every employee's hours with no indication
anything had failed.

`getEmployeeContext()` had the same shape: a query failure returned `null`,
which callers treat as "needs onboarding", so a transient error walked an
established admin into the create-an-organization flow. It throws now.

### CSV formula injection

`timesheetToCsv` quoted `"`/`,`/newline but not a leading `=`, `+`, `-`,
`@`, TAB or CR. `fullName` and `siteName` are operator-supplied free text
and this file is built to be opened in Excel, where such a cell executes on
open. Now apostrophe-prefixed.

### Fail-closed middleware, and no more open redirect

- Missing Supabase env vars used to pass **every** request through
  unauthenticated. One typo on a deploy silently made `/admin` public. It
  now throws in production and passes through only in development.
- `PROTECTED_PATHS` gained `/checkin` and `/api`, and matching is
  segment-aware so a future `/admin-preview` isn't matched as `/admin`.
  (`checkin/page.tsx` already claimed middleware protected it. It didn't.)
- `/login?next=` was passed to `router.push` unvalidated — an open redirect
  firing the instant the user finished typing their password. Now
  same-origin relative paths only.

### Onboarding stopped publishing the founder's email

`create_organization_for_self` defaulted `employees.full_name` to
`auth.users.email`. That column is shown on the roster to everyone they
later invite. The RPC takes an `admin_name` parameter now (trailing and
defaulted, so existing callers still work) and the form collects it.

### `setup-admin.sql` no longer contains a personal address

It was hardcoded to a real Gmail address, committed, and referenced in two
docs. Now `v_admin_email` / `v_admin_name` variables at the top, with a
guard that refuses to run until they're changed.

### `powersync-setup.sql` was a backdoor waiting to be run

```sql
CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD 'CHANGE_ME_BEFORE_RUNNING';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;
```

A login-capable, RLS-bypassing role with a committed password and SELECT on
every table present **and future** — including the webhook secrets and
`employees.pay_rate` that the publication was carefully scoped to exclude.
Now `NOLOGIN` with a separate ALTER the operator must run, and grants
scoped to the four published tables.

Unrun SQL, so this cost nothing to fix. It would have been expensive to
discover later.

---

## Not applied — 2 of 90

**`0003_fix_super_admin_scope.sql` — extract `current_role_is` /
`can_admin_org` helpers.** A readability refactor of a migration that is
probably already applied to a live database. Rewriting applied migrations is
how schema drift starts. If the repetition is worth removing, do it as a new
migration. Deferred, not rejected.

**`context & sessions/README.md` — "use `pnpm approve-builds`".** Wrong:
this is an npm project with no `pnpm-lock.yaml`. The existing
`npm install-scripts approve` line is correct. Rejected.

---

## Left deliberately, and why

**The FAQ still overstates the product in three other answers.** Only the
flagged one was corrected — it now says browser and kiosk QR work today and
that native apps and biometric terminals are roadmap. The answers claiming a
payroll **API**, and **shift swaps**, describe things that don't exist
either. That is marketing copy, and rewriting it is your call, not a
security fix.

**Two offline queues still exist.** `attendance_events` in the PowerSync
schema and the `attendpac:offline-queue` localStorage array are both present
and neither is wired to the other. This is the sequencing doc 08 describes,
not an oversight — PowerSync is inert while `NEXT_PUBLIC_POWERSYNC_URL` is
unset. It is now commented loudly in `schema.ts`: whoever does the step-4
rewrite must **delete the localStorage path in the same change**, because
running both means two partial, independently-retried copies of one ledger.

**The contact form now uses `mailto:`.** It previously ran a 600 ms timeout
and rendered "Request received — we'll be in touch within one business day"
while sending nothing anywhere. Every pilot enquiry went into the void with
the sender believing it had arrived. `mailto:hello@pac.africa` at least
delivers. Replace it with a route handler when there's somewhere to put
leads.

---

## Verification

```
tsc --noEmit  ✓ exit 0
npm run lint  ✓ exit 0, no warnings
npm run build ✓ 18 routes, exit 0
```

Route sizes: `/` 31.3 kB (266 kB), `/admin` 8.32 kB (303 kB),
`/admin/reports` 10.7 kB (251 kB), `/dashboard` 9.88 kB (269 kB).

**Not verified, and this is the important line in this document:**

- **0008 is unexecuted SQL.** The RLS changes are the highest-risk part of
  this session — a policy that is too tight breaks the app, and you find out
  at runtime, not at build.

  > **Corrected later the same day.** This originally read "Nothing has run
  > against a live Postgres… like 0005–0007 before it". Wrong: probing the
  > project in `.env.local` showed **0001–0007 are all applied**. 0008 is
  > unexecuted; the ones before it are not. Because 0007 *is* live and 0008
  > is not, the geofence is bypassable on the real project right now. See
  > [12](12-platform-console-and-limits.md).
- **No browser pass.** Every change to a page or component here is
  build-clean and unlooked-at. [07](07-ui-motion-layer.md) and
  [09](09-v3-hero-and-bento.md) both record a green build followed by real
  defects found in the first browser pass. Assume the same applies.
- Test these specifically once a database exists: the four-tier read
  policies (a manager should see their site's leave and no more), the
  unassigned-employee punch rejection, and `client_event_id` de-duplication
  on replay.

[10](10-live-db-bringup.md) is still the bring-up plan; add 0008 to Phase 2
and the cases above to Phase 4.
