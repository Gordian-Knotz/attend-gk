# The HR onboarding suite — planning document

**Date:** 11 August 2026
**Status:** plan only. Nothing here is built, and it should not be built as one
piece of work.

Today's onboarding is one screen that takes an organization name and a person's
name, and creates an org, a default site and an `org_admin` row. The intent is to
grow that into a full HR surface holding employee biodata. This document exists to
say what that means, how to break it up, and which decisions must be made before
any of it is written — because the wrong first migration here is expensive.

---

## What exists today

`create_organization_for_self` (migration 0002) atomically creates the
organization, one default site and the caller's employee row.
`/admin/staff` invites people by email through the Admin API, creating an auth
user and an `employees` row with a role and a site.

`employees` holds: `id`, `org_id`, `site_id`, `full_name`, `role`,
`employment_type`, `pay_rate`, `created_at`. **That is the entire employee
record.** No contact details, no next of kin, no identification, no documents, no
start date.

That last absence already causes visible wrongness: doc 06 records that reports
apply *today's* roster to the whole period, so somebody hired last week reads as
absent on days before they joined. **An employment start date is not a
nice-to-have — it is the fix for a bug already on screen.**

---

## Why this must be decomposed

An HR suite is not a feature. It is at least six, with different owners,
different privacy weight and different failure modes:

| # | Piece | Why it is separate |
|---|---|---|
| 1 | **Employment dates** | Small, and it fixes an existing reporting bug. Should ship first, alone. |
| 2 | **Contact and personal details** | Address, phone, next of kin, date of birth. Ordinary fields, but the first genuinely sensitive personal data in the schema. |
| 3 | **Identification and right to work** | National ID / passport / KRA PIN. Higher sensitivity again, and legally loaded. |
| 4 | **Documents** | Contracts, certificates. Needs object storage, which the app does not currently use at all. |
| 5 | **Onboarding as a process** | A checklist with state per hire: invited → details submitted → documents uploaded → approved. This is workflow, not fields. |
| 6 | **Self-service editing** | Who may change what, and what needs approval. Cuts across all of the above. |

Building these as one migration and one giant form is how a schema ends up with
forty nullable columns nobody trusts.

**Recommended order: 1, then 5, then 2, then 3, then 6, then 4.** Dates first
because they fix something broken. The process before the fields, because the
process determines which fields are actually required and when — designing fields
first invariably produces some that nothing ever collects.

---

## The decisions to make before any migration

### 1. Where do employment terms live?

`employees` is currently a thin join between an auth user, an org and a site.
Adding thirty biodata columns to it makes the table that every RLS policy in the
schema references also the table holding someone's date of birth.

**Recommendation: a separate `employee_profiles` table**, one row per employee,
holding personal and contact data. `employees` stays thin and keeps being the
thing policies join against. This also means the sensitive table can carry
*stricter* policies than `employees` does — which is the whole point, because
`employees` is readable across an organization by design and a home address must
not be.

### 2. Who can read personal data?

This is the question that matters most and it has no default answer. Today
`employees` is org-readable, so any colleague can list the roster. A home address
and a date of birth cannot inherit that.

Proposed tiers, to be confirmed:

- **The employee** — reads and edits their own, some fields needing approval.
- **`org_admin`** — reads all in their org. It is an HR function.
- **`manager`** — should probably read *nothing* personal beyond what the roster
  already shows. A shift manager does not need a next of kin.
- **`super_admin` (us, the vendor)** — should read **none of it**. This matters:
  the tenant detail page built today deliberately stops at name, role, site and
  last-seen for exactly this reason. An HR table would make `super_admin`'s
  cross-org read a cross-org read of *personal* data, which is a different
  proposition entirely and probably a contractual one.

**That last point is a genuine design constraint, not a detail.** RLS gives
`super_admin` cross-org read on everything by default in this schema. An
`employee_profiles` table must be written to *exclude* `super_admin`, which is the
opposite of every other policy in the codebase. It will look wrong to whoever
reads it next, so the migration must say why in a comment.

### 3. Who owns the truth during onboarding?

If a hire fills in their own details, there is a window where the record is
partial and unverified. Either the app models that state (piece 5) or every
consumer must tolerate half-filled rows. Modelling it is better and is why the
process should precede the fields.

### 4. Documents mean object storage

Contracts and ID scans cannot go in Postgres. That means Supabase Storage or
Railway object storage, with its own access rules, its own lifecycle and its own
retention question — the same question migration 0012 just answered for contact
requests. It is the largest single piece and the most deferrable.

---

## What piece 1 looks like, concretely

Because it is small, ships alone, and fixes a real bug:

```sql
alter table employees
  add column if not exists employment_start_date date,
  add column if not exists employment_end_date   date;
```

Then `buildDailySeries` and `buildTimesheet` filter the roster per day by those
dates, instead of applying today's roster across the whole window. Doc 06 names
this as the fix; the two functions already carry a comment saying so.

**Backfill matters.** Existing employees have no start date. Either treat null as
"employed for the whole window" (preserves today's behaviour exactly, which is the
safe default) or backfill from `created_at` (more accurate, but invents a fact).
**Recommendation: null means always-employed, stated in the code**, because a
reporting change that silently moves historical numbers is worse than a slightly
conservative one.

---

## What to do next

1. Confirm the read tiers in decision 2, particularly that the vendor
   (`super_admin`) is excluded from personal data. Everything else follows from it.
2. Build piece 1 on its own. It is a small migration plus two function changes,
   and it removes a known-wrong number from reports.
3. Then spec piece 5 — the onboarding process — before designing any fields.

Nothing in this document should be implemented until 1 is answered.
