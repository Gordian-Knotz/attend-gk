# Staff routes, and notices that actually reach staff

**Date:** 11 August 2026
**Branch:** `harden-security-audit`
**Status:** approved, not implemented

Two changes, built together because they touch the same files: the staff
dashboard becomes real routes, and notices become a feature that staff can
actually see and that admins can actually target.

---

## Problem

### The staff dashboard is one long page

`/dashboard` renders clock-in, shifts, attendance history and leave as four
cards on a single page, with a sidebar whose links are in-page anchors. That was
a deliberate call earlier today — one page means one set of queries and one set
of failure states — and it is now the wrong shape. The staff surface is growing
(leave balances, notices, and eventually HR biodata), and a page that grows
without bound is worse than four pages with four honest error paths.

### Notices have never reached anybody

`notifications` landed in migration 0006 with a posting UI on `/admin`. Three
things are wrong with it:

- **Staff cannot see notices at all.** Nothing under `src/app/dashboard` or
  `src/app/checkin` reads the table. Admins have been posting announcements that
  only other admins can read. The feature has never performed its function.
- **"Dismiss" deletes the row for everyone.** `dismissNotice` runs
  `delete().eq("id", noticeId)`. One manager clearing their view removes the
  notice from the entire organization. The button's label says otherwise.
- **Nobody knows who posted a notice**, and targeting is limited to
  org-wide or one site. There is no author column and no way to address a role.

---

## Decisions

### Four routes, not three, and not anchors

```
/dashboard              overview + clock in
/dashboard/shifts       upcoming roster
/dashboard/attendance   punch history
/dashboard/leave        requests, and later the balance
```

Rejected: folding attendance into the overview (the overview grows back toward
the page we are splitting) and keeping anchors (does not scale, and a URL cannot
address a section).

**The cost is accepted explicitly.** Four pages means four query sites and four
failure states, and doc 11's rule binds each one: a failed query must never
render as an empty state. "No shifts scheduled in the next 7 days" shown to a
rostered employee because a query errored is the one wrong answer with
consequences for a shift worker. Every page gets its own error branch.

### Notices sit in a persistent right rail

On every staff route, so an announcement is visible wherever the employee is —
not only on the overview, which someone landing on `/dashboard/leave` would never
see. Below `lg` the rail moves to the **bottom of the page** rather than being
hidden: a notice nobody sees on a phone repeats the bug this work exists to fix.

### Dismiss and delete become different actions

| Action | Who | Effect |
|---|---|---|
| **Dismiss** | anyone, including staff | Hides that notice for **that person only** |
| **Delete** | manager (own site), org_admin, super_admin | Retracts the notice for **everyone** |

Today one button labelled "Dismiss" does the second thing. Separating them, and
labelling them differently, is most of the fix.

### Targeting: organization, site, role — combinable

A notice addresses everyone in the org, or one site, or one role, or a
combination ("all staff at Two Rivers Mall"). `site_id` null means all sites;
`target_role` null means all roles.

**Individual addressing is deliberately excluded.** Naming people turns a
notice board into a messaging channel, which invites replies, read receipts and
threading that this table is not built for and that nobody asked for.

**Expiry dates and pinning are also out**, for now. They are easy to add later
and neither is needed to make the feature work.

---

## Schema — migration 0013

```sql
alter table notifications
  add column if not exists author_id   uuid references employees(id) on delete set null,
  add column if not exists target_role employee_role;

create table if not exists notification_dismissals (
  notification_id uuid not null references notifications(id) on delete cascade,
  employee_id     uuid not null references employees(id)     on delete cascade,
  dismissed_at    timestamptz not null default now(),
  primary key (notification_id, employee_id)
);
```

`author_id` is `on delete set null` rather than cascade: removing an employee
must not delete the announcements they posted. The dismissals table cascades on
both sides — a dismissal has no meaning without either end.

Idempotent throughout, like 0008–0012, and ending with
`notify pgrst, 'reload schema'` for the same reason: PostgREST serves a cached
schema and 404s new columns until it refreshes, which looks exactly like the
migration not having run.

### Read policy

A notice is visible to an employee when **all** hold:

- `org_id` matches theirs, and
- `site_id is null` **or** equals their `site_id`, and
- `target_role is null` **or** equals their `role`

`super_admin` continues to see everything. The dismissals table is self-only for
both read and write — an employee's dismissals are nobody else's business, and
letting one person write another's dismissal would let a manager silence a notice
for staff.

### Write policy

Unchanged in shape from 0006: `super_admin` anywhere, `org_admin` anywhere in
their org, `manager` restricted to their own site. Enforced in the policy **and**
in the action, because the action can return a readable error where a policy
failure is opaque.

**A manager may target any role, but only at their own site.** So "all staff at
my site" and "all managers at my site" are both allowed; "all staff
org-wide" is not. The site restriction is the boundary that matters — a manager
addressing their own site's managers is ordinary, and restricting roles as well
would buy nothing.

`author_id` is set from the session in the action and is **not** accepted from
the client, so a manager cannot post a notice under somebody else's name.

**A per-column risk worth naming:** a manager must not be able to post a notice
with someone else's `author_id`. The action sets it from the session rather than
accepting it from the client — the same discipline that made 0008, 0010 and 0011
necessary, applied before it becomes a migration.

---

## Architecture

```
src/app/dashboard/
  layout.tsx              new — sidebar, notices rail, greeting, suspended check
  page.tsx                modified — overview + clock in only
  shifts/page.tsx         new
  attendance/page.tsx     new
  leave/page.tsx          new
  notices-rail.tsx        new — server component, renders the rail
  dismiss-notice-button.tsx  new — client, staff-side dismiss

src/components/dashboard/
  employee-sidebar.tsx    modified — real Links + usePathname, no scroll-spy

src/app/admin/
  notice-dialog.tsx       modified — site + role selectors
  notifications-actions.ts modified — targeting, author, dismiss vs delete
  page.tsx                modified — show author and audience
```

**The layout owns everything shared**, so no page repeats the chrome.
`getEmployeeContext` is already wrapped in `perRequest` (React `cache`), so the
layout and each page calling it produce one round trip per navigation, not two.

**Middleware needs no change.** `/dashboard` is already in `PROTECTED_PATHS` and
matching is segment-aware (`pathname === p || pathname.startsWith(p + "/")`), so
every sub-route inherits protection. This is the trap that bit `/super`: a route
is only protected by the layer you can point at, and here that layer already
covers the children.

### The sidebar changes shape

Scroll-spy goes away — with real routes the active item is just
`pathname === href`. The sliding `layoutId` highlight stays. The mobile rail stays
a horizontal bar of links.

**Keep the fix from earlier today:** the container is a row only from `md` up.
Making it unconditionally `flex` put the mobile rail *beside* the content, 627px
wide in a 390px window. That is now a documented bug in doc 14; do not undo it.

---

## Error handling

Every page captures its query's `error` and renders a distinct failure state.
The notices rail does the same: a failed notices read shows "Couldn't load
notices" rather than an empty rail, because an empty rail says "no announcements"
and that is a claim, not an absence of data.

---

## Verification

- `npm test` for anything pure that comes out of this.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — expect **20 route rows**
  (17 now, plus three new staff routes).
- `npm run smoke` — public routes, expect 107/107 unchanged.
- **`npm run smoke:authed` is the real gate**, and it must be extended: navigate
  all four routes, assert each renders its own content, assert the sidebar's
  active item follows the URL, assert the notices rail appears on every route and
  moves to the bottom below `lg`.
- The staff demo account (`staff.demo@pac.africa`) can exercise all of it. It
  needs at least one notice posted to it — seed one, since no notice currently
  targets that org.

**Not verifiable without an admin login:** the post-notice dialog's new
selectors, and that a manager cannot post outside their own site. Note it rather
than claim it.

---

## Out of scope, planned separately

- **Leave entitlements and utilization** — needs a policy decision about where an
  allowance lives, which the HR suite's shape informs. Its own spec.
- **The HR onboarding / biodata suite** — its own spec, this session, plan only.
- **The help chatbot** — independent of everything here; next session.
