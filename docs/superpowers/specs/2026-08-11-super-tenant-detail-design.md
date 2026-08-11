# Platform console: tenant detail pages

**Date:** 11 August 2026
**Branch:** `harden-security-audit`
**Status:** design approved, not implemented

Fleshes out `/super` — the Activ-HR operator console described in
[doc 12](../../../context-sessions/12-platform-console-and-limits.md) — by
adding a per-tenant detail page. No database changes.

---

## Problem

`/super` is one page: four platform tiles, a signups chart, an attention panel,
and a table of every organization with plan, billing and suspend controls inline
in each row.

It answers "who exists and who has paid". It cannot answer anything about a
*single* tenant — how far they've rolled out, which sites they run, who their
admins are, whether the account is actually being used. When a customer asks a
question about their own account, the console has nothing to show.

## Non-goals

Deliberately out of scope, each for a stated reason:

- **A leads inbox.** `contact_requests` is written by the landing page and read
  by nothing, so every pilot enquiry since migration 0009 is unread. This is a
  real gap and it is worth doing next, but it is a different page with a
  different job.
- **Revenue / MRR.** There is no price anywhere in the schema. Doing this
  properly means adding commercial fields and a per-column guard like 0010's,
  which is its own design.
- **Audit log.** Doc 12 deferred it explicitly. Worth having once more than one
  person holds a `super_admin` account.
- **Impersonation.** Same reasoning as doc 12: this is a vendor console, not a
  support tool, and acting as a customer is a much larger decision.

## Decisions

### A route segment, not an expanding row

`/super/orgs/[id]`, rendered server-side under the existing `/super` layout.

Rejected: expandable table rows (a tenant can't be linked to, the back button
does nothing, and the platform overview — already four platform-wide queries — 
gets heavier) and a per-org dialog (same, plus the dialog-height problem still
untested on `/admin/settings`).

A route also keeps per-tenant queries off the overview entirely: they run only
when a tenant is opened.

### Aggregates plus roster identity — and no more

RLS lets `super_admin` read every table for every tenant, so the constraint here
is a decision, not a capability.

| Shown | Not shown |
|---|---|
| Sites, staff and punch counts | Individual attendance records |
| Usage trend over 30 days | Leave requests |
| Site names, geofence centre and radius | `pay_rate` |
| Roster: name, role, site, last seen | `employment_type` |
| Which accounts are `org_admin` | |

Enough to answer "their admin can't sign in" or "are they actually using it".
Not enough to reconstruct an individual's movements — the vendor should not be
able to read one person's timesheet as a side effect of account support.

**`pay_rate` and `employment_type` are omitted from the `select` itself, not
hidden in the template.** A column that never leaves Postgres cannot leak
through a serialized prop, a future refactor, or a stray `console.log`. This
mirrors the sync rules, which exclude the same two columns for the same reason.

### Commercial controls move to the detail page

Plan, billing and suspension move out of the overview table row. The table keeps
them as read-only badges and links to the tenant.

Suspension locks an entire company out of the product. A control that does that,
sitting in row 14 of a dense table, is a misclick with a customer on the other
end of it. On the detail page the action sits next to the name of the
organization it applies to.

Consequence to accept: flipping several tenants' billing in one sitting now
costs a navigation each.

### No migration

The page is built from `organizations`, `sites`, `employees` and
`attendance_events` as they already exist. Nothing to run against the live
database, and the whole feature is reversible by deleting files — which matters
on a branch that already carries four unreviewed migrations' worth of caution.

## Architecture

```
src/app/super/
  page.tsx                    modified — row links out, controls removed
  org-controls.tsx            unchanged — reused as-is on the detail page
  actions.ts                  unchanged — already re-checks super_admin
  orgs/[id]/
    page.tsx                  new — server component, all four reads
    not-found.tsx             new — unknown id
```

### Authorization

Three layers, all already present:

1. `src/middleware.ts` — `/super` is in `PROTECTED_PATHS` (added 10 Aug; it had
   been missing, with the layout catching it instead).
2. `src/app/super/layout.tsx` — redirects anyone who is not `super_admin`.
3. `super/actions.ts` — each action re-checks the role before writing.

The page adds nothing. An unknown or malformed id calls `notFound()`; there is
no existence-oracle concern because only super-admins can reach the route.

### Data flow

One `Promise.all`, four reads, all RLS-scoped:

| Query | Columns | Purpose |
|---|---|---|
| `organizations` by id | name, slug, plan_tier, billing_status, suspended_at, suspended_reason, created_at | header, badges, danger zone |
| `sites` by org | id, name, geofence_lat, geofence_lng, geofence_radius_m | sites card |
| `employees` by org | id, full_name, role, site_id | roster, staff count |
| `attendance_events` by org, last 30 days | employee_id, occurred_at | usage chart, per-employee last seen, active-staff count |

Derived in memory from the events array, not with further queries:

- daily punch series for the chart
- last-seen per employee
- **active staff** = distinct `employee_id` with at least one punch in the
  window. This is the number that distinguishes a tenant who rolled out from one
  who signed up, and it is the same distinction the overview already makes at
  platform level.

### Error handling

Every query's `error` is captured. Any failure renders a critical `Callout`
instead of the page.

This rule matters more here than anywhere else in the app: "0 sites, 0 staff, no
usage" for a healthy tenant is indistinguishable from a customer who never
onboarded, and someone could act on it — chase a churn risk that isn't one, or
worse, suspend on a misread. Doc 11 records four pages that rendered database
failures as confident empty states; this page must not become the fifth.

### Caching

`perRequest` only. This is org-scoped data and must never touch
`cachePlatformAggregate`, even though only super-admins can read it — doc 12's
rule stands on the shape of the cache key, not on who happens to be looking.

## Components

Reused unchanged: `PageHeader`, `StatTiles`, `Card`, `Table`, `Badge`,
`Callout`, and `org-controls.tsx` (`PlanSelect`, `BillingSelect`,
`SuspensionButton`).

New: only the page itself and its `not-found`. The usage chart reuses
`SignupTrendChart` — despite the name it is a generic labelled daily series, and
punches-per-day is the same shape. If the name becomes confusing, rename that
component rather than adding a third chart.

## Verification

- `tsc`, `lint`, `build` clean.
- `scripts/smoke.mjs` **cannot cover this** — it is public-routes only and this
  needs a session. That is a real gap, not an oversight.
- To actually look at it: doc 09's fixture-route trick — a temporary route
  rendering the same components against fixture data, deleted afterwards. This
  avoids writing rows into a live tenant's database purely to see a layout.
- Behaviour worth checking once a `super_admin` session exists: an org with zero
  sites and zero staff renders as empty rather than broken; a suspended org
  shows the banner; suspend and restore round-trip; and the roster shows no
  `pay_rate` anywhere in the page source.

## Risks

- **The privacy line is a judgment, not a mechanism.** Nothing in the database
  stops a future page from selecting `pay_rate`; the discipline lives in the
  query. Worth restating in the file's own comment, which the implementation
  does.
- **Suspension remains an application control.** Doc 12's caveat is unchanged: a
  suspended org's members can still reach their rows through PostgREST. This
  page makes suspension easier to use, which slightly raises the odds of it
  being used against someone motivated to go around it. The RLS-level fix is
  still outstanding.
