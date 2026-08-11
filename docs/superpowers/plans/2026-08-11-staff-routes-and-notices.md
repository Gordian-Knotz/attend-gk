# Staff Routes and Notices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the staff dashboard into four real routes, and make notices a feature staff can see and admins can target.

**Architecture:** A `/dashboard` layout owns the sidebar, a persistent notices rail and the greeting; four pages sit beneath it, each owning one query and its own failure state. Migration 0013 adds an author, role targeting and a per-employee dismissals table, and narrows the notices read policy so a notice reaches its intended audience.

**Tech Stack:** Next 15 App Router (server components), Supabase + RLS, Tailwind 4, `node --test` for pure logic.

## Global Constraints

- **Migration 0013 must be idempotent and re-runnable**, like 0008–0012: `add column if not exists`, `drop policy if exists` before create, `create table if not exists`. It must end with `notify pgrst, 'reload schema';`.
- **Do not modify migrations 0001–0012.** They are applied to the live database.
- **Every query captures its `error`** and renders a distinct failure state. A failed read must never render as an empty state — "No shifts scheduled in the next 7 days" shown to a rostered employee because a query errored is the one wrong answer with consequences for a shift worker.
- **`author_id` is set from the session inside the action.** It is never accepted from the client.
- **Managers may target any role, but only their own site.** Enforced in the action *and* in the policy.
- **`pay_rate` and `employment_type` are never selected** anywhere in this work.
- **Keep the mobile layout fix from doc 14:** the dashboard container is a row only from `md` up (`md:flex`, not `flex`). Making it unconditionally `flex` puts the mobile rail *beside* the content — 627px wide in a 390px window. Do not undo it.
- Server actions return **fresh object literals** (`{ error: "..." }` / `{ success: true as const }`) so call sites can read `result?.error`.
- Route rows go from **17 to 20** (three new staff routes).
- The demo password is deliberately not in this repository. Export `DEMO_PASSWORD` in your shell before any `smoke:authed` step; if it is unset the script exits with a message rather than guessing.
- Test files are `.mts` and run via `node --test "src/**/*.test.mts"`. `node --test <directory>` does not work on this setup.

---

### Task 1: Migration 0013 — author, role targeting, dismissals

**Files:**
- Create: `supabase/migrations/0013_notice_targeting.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `notifications.author_id uuid`, `notifications.target_role employee_role`, table `notification_dismissals (notification_id, employee_id, dismissed_at)`. Tasks 2 and 5 depend on all three.

- [ ] **Step 1: Read the migration you are amending**

```bash
cat supabase/migrations/0006_notifications.sql
cat supabase/migrations/0011_employee_role_integrity.sql
```

0006 owns the table and its two policies. 0011 is the closest house-style match: header comment explaining what was wrong, section dividers, comments above each statement.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0013_notice_targeting.sql`:

```sql
-- 0013 — Notices that reach the people they are for.
--
-- Three things were wrong with notices as shipped in 0006.
--
-- 1. Staff could not see them at all. Nothing under src/app/dashboard read the
--    table, so since 0006 admins have been posting announcements that only
--    other admins could read. The feature never performed its function.
--
-- 2. "Dismiss" ran a DELETE. One manager clearing their own view removed the
--    notice from the entire organization, while the button said "Dismiss".
--    There was no per-person state to record, so there was nothing else it
--    could have done.
--
-- 3. Nobody knew who posted a notice, and a notice could only be addressed to
--    an organization or one site — not to a role.
--
-- Re-runnable throughout, like 0008-0012.

-- ── 1. Author and role targeting ────────────────────────────────────────
--
-- author_id is `on delete set null`, deliberately: removing an employee must
-- not delete the announcements they wrote. The org keeps the notice and loses
-- the attribution, which is the right way round.
--
-- target_role null means "every role". site_id (from 0006) null already means
-- "every site". The two combine, so "all staff at Two Rivers Mall" is
-- expressible without a join table.

alter table notifications
  add column if not exists author_id uuid references employees(id) on delete set null;

alter table notifications
  add column if not exists target_role employee_role;

-- ── 2. Per-employee dismissals ──────────────────────────────────────────
--
-- This is what makes a dismiss that is not a delete possible. Cascades on both
-- sides: a dismissal has no meaning without either end.

create table if not exists notification_dismissals (
  notification_id uuid not null references notifications(id) on delete cascade,
  employee_id     uuid not null references employees(id)     on delete cascade,
  dismissed_at    timestamptz not null default now(),
  primary key (notification_id, employee_id)
);

alter table notification_dismissals enable row level security;

-- Self only, for both read and write. An employee's dismissals are nobody
-- else's business, and letting one person write another's dismissal would let a
-- manager silence a notice on staff's behalf.
drop policy if exists "dismissals: self read" on notification_dismissals;
create policy "dismissals: self read" on notification_dismissals for select
  using (employee_id = auth.uid());

drop policy if exists "dismissals: self insert" on notification_dismissals;
create policy "dismissals: self insert" on notification_dismissals for insert
  with check (employee_id = auth.uid());

drop policy if exists "dismissals: self delete" on notification_dismissals;
create policy "dismissals: self delete" on notification_dismissals for delete
  using (employee_id = auth.uid());

-- ── 3. Narrow the read policy to the notice's audience ──────────────────
--
-- 0006's policy was "same org, or super_admin" — every notice to everybody in
-- the organization. Now a notice is visible when the org matches AND the site
-- is unset or matches yours AND the target role is unset or matches yours.
--
-- Note this does NOT blind admins: "notifications: admins manage" from 0006 is
-- `for all`, which includes select, and RLS policies are OR'd — so org_admin
-- keeps seeing every notice in their org through that policy. It does correctly
-- narrow managers, who only reach the manage policy for their own site.

drop policy if exists "notifications: select in org" on notifications;
create policy "notifications: select in org" on notifications for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or (
      org_id = (select org_id from public.current_employee())
      and (
        site_id is null
        or site_id = (select site_id from public.current_employee())
      )
      and (
        target_role is null
        or target_role = (select role from public.current_employee())
      )
    )
  );

-- PostgREST serves a cached schema and 404s new columns and tables until it
-- refreshes, which looks exactly like the migration not having run.
notify pgrst, 'reload schema';
```

- [ ] **Step 3: Confirm no existing migration was touched**

```bash
git status --short supabase/migrations/
```

Expected: only `0013_notice_targeting.sql` as new. If any of `0001`–`0012` shows as modified, revert that file — they are applied to the live database.

- [ ] **Step 4: Confirm every statement is re-runnable**

Read your own file back and check each statement is one of: `add column if not exists`, `create table if not exists`, `drop policy if exists` + `create policy`, or `notify`. There must be no bare `alter table ... add constraint` and no bare `create policy`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0013_notice_targeting.sql
git commit -m "Add notice targeting, authorship and per-person dismissals

Notices shipped in 0006 with three defects. Staff could not see them at all,
so admins have been posting announcements only other admins could read.
'Dismiss' ran a DELETE, removing a notice from the whole organization when one
manager cleared their view. And a notice had no author and could not be
addressed to a role.

Adds author_id (on delete set null, so removing an employee does not delete
their announcements), target_role, and a notification_dismissals table which is
what makes a dismiss that is not a delete possible. Narrows the read policy to
the notice's actual audience.

Unexecuted. Idempotent, like 0008-0012."
```

**This migration is not run by this task.** It is SQL only; the app must keep working without it until an operator applies it, so Task 2 must tolerate the columns being absent — see its notes.

---

### Task 2: Notice actions, audience labels, and the deeper dialog

**Files:**
- Create: `src/lib/notice-audience.ts`
- Create: `src/lib/notice-audience.test.mts`
- Modify: `src/app/admin/notifications-actions.ts`
- Modify: `src/app/admin/notice-dialog.tsx`
- Modify: `src/app/admin/dismiss-notice-button.tsx`
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `notifications.author_id`, `notifications.target_role`, `notification_dismissals` (Task 1).
- Produces:
  - `describeAudience({ siteName, targetRole }): string` from `@/lib/notice-audience`
  - `postNotice({ message, level, siteId, targetRole })` — `targetRole: string | null`
  - `deleteNotice(noticeId)` — admin/manager, removes for everyone
  - `dismissNoticeForSelf(noticeId)` — anyone, hides for that person
  Task 5 uses `dismissNoticeForSelf` and `describeAudience`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/notice-audience.test.mts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { describeAudience } from "./notice-audience.ts";

test("no site and no role is everyone", () => {
  assert.equal(describeAudience({ siteName: null, targetRole: null }), "Everyone");
});

test("a site alone names the site", () => {
  assert.equal(
    describeAudience({ siteName: "Two Rivers Mall", targetRole: null }),
    "Two Rivers Mall"
  );
});

test("a role alone pluralises the role", () => {
  assert.equal(describeAudience({ siteName: null, targetRole: "staff" }), "All staff");
  assert.equal(describeAudience({ siteName: null, targetRole: "manager" }), "All managers");
});

test("org_admin reads as admins, not org_admins", () => {
  assert.equal(describeAudience({ siteName: null, targetRole: "org_admin" }), "All admins");
});

test("site and role combine", () => {
  assert.equal(
    describeAudience({ siteName: "Garden City", targetRole: "staff" }),
    "Staff at Garden City"
  );
});

test("an unknown role degrades to the raw value rather than throwing", () => {
  assert.equal(describeAudience({ siteName: null, targetRole: "wizard" }), "All wizard");
});
```

- [ ] **Step 2: Run it and verify it fails**

```bash
node --test "src/**/*.test.mts"
```

Expected: FAIL — cannot find module `./notice-audience.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/notice-audience.ts`:

```ts
/**
 * Human-readable audience for a notice.
 *
 * Pure, and imports nothing, so it can be tested with `node --test` — the same
 * constraint `tenant-summary.ts` documents. A notice's audience is the thing an
 * admin most needs to be sure of before posting, so it is worth a test rather
 * than a template expression.
 */

const ROLE_PLURAL: Record<string, string> = {
  staff: "staff",
  manager: "managers",
  org_admin: "admins",
  super_admin: "super admins",
};

export function describeAudience(input: {
  siteName: string | null;
  targetRole: string | null;
}): string {
  const { siteName, targetRole } = input;
  // An unknown role is echoed rather than swallowed: a wrong label is better
  // than a confident "Everyone" on a notice that is in fact restricted.
  const role = targetRole ? ROLE_PLURAL[targetRole] ?? targetRole : null;

  if (!siteName && !role) return "Everyone";
  if (!siteName && role) return `All ${role}`;
  if (siteName && !role) return siteName;

  const capitalised = role!.charAt(0).toUpperCase() + role!.slice(1);
  return `${capitalised} at ${siteName}`;
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
node --test "src/**/*.test.mts"
```

Expected: PASS — 6 new tests, plus the 9 existing `tenant-summary` tests, 15 total.

- [ ] **Step 5: Rework the actions**

In `src/app/admin/notifications-actions.ts`:

Add a role allow-list beside the existing `LEVELS`:

```ts
const TARGET_ROLES = ["staff", "manager", "org_admin"] as const;
```

`super_admin` is deliberately not targetable — it is the vendor's own role, not a tenant audience.

Change `postNotice`'s input to `{ message: string; level: string; siteId: string | null; targetRole: string | null }`. Keep the existing message trim, the 500-character cap, the level allow-list and the manager site pinning exactly as they are, and add:

```ts
  // Validated against an allow-list, not trusted. A server action is a public
  // HTTP endpoint; the TypeScript signature is documentation, not a control.
  const targetRole =
    input.targetRole && (TARGET_ROLES as readonly string[]).includes(input.targetRole)
      ? input.targetRole
      : null;
```

and add `author_id: employee.id` and `target_role: targetRole` to the insert. **`author_id` comes from the session, never from `input`** — otherwise a manager could post under somebody else's name.

Replace `dismissNotice` with two exported actions:

```ts
/**
 * Removes a notice for everyone. This is what the old `dismissNotice` actually
 * did, while being labelled "Dismiss" — so it is now named for its effect and
 * restricted to the people entitled to retract an announcement.
 */
export async function deleteNotice(noticeId: string) {
  const employee = await getEmployeeContext();
  if (!employee || employee.role === "staff") {
    return { error: "Only managers and admins can delete notices." };
  }

  const supabase = await createClient();
  const query = supabase.from("notifications").delete({ count: "exact" }).eq("id", noticeId);
  if (employee.role !== "super_admin") {
    query.eq("org_id", employee.orgId);
  }

  const { error, count } = await query;
  if (error) return { error: error.message };
  if (!count) return { error: "Notice not found, or you can't delete it." };

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { success: true as const };
}

/**
 * Hides a notice for the caller alone. Available to everyone, staff included —
 * clearing your own board is not an administrative act.
 */
export async function dismissNoticeForSelf(noticeId: string) {
  const employee = await getEmployeeContext();
  if (!employee) return { error: "You need to be signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_dismissals")
    .upsert(
      { notification_id: noticeId, employee_id: employee.id },
      { onConflict: "notification_id,employee_id" }
    );

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { success: true as const };
}
```

`upsert` rather than `insert` so a double-click is not an error.

- [ ] **Step 6: Add the role selector to the dialog**

In `src/app/admin/notice-dialog.tsx`, add a `targetRole` state defaulting to `"all"` alongside the existing `siteId` state, a `Select` mirroring the site selector exactly (options: All roles / Staff / Managers / Admins), and pass `targetRole: targetRole === "all" ? null : targetRole` into `postNotice`.

Below the two selectors, show the resulting audience so the poster can see what they are about to do:

```tsx
<p className="text-xs text-muted-foreground">
  Goes to{" "}
  <span className="font-medium text-foreground">
    {describeAudience({
      siteName: siteId === "all" ? null : sites.find((s) => s.id === siteId)?.name ?? null,
      targetRole: targetRole === "all" ? null : targetRole,
    })}
  </span>
  .
</p>
```

Import `describeAudience` from `@/lib/notice-audience`.

- [ ] **Step 7: Split the button, and show author and audience on /admin**

Rename `src/app/admin/dismiss-notice-button.tsx`'s component to `DeleteNoticeButton`, point it at `deleteNotice`, set its `aria-label` to `Delete notice`, and give it a confirm step — it now removes a notice for the whole organization, and the previous label hid that.

In `src/app/admin/page.tsx`: select `author_id, target_role` alongside the existing notice columns, resolve author names from the `employees` list the page already fetches, and render `describeAudience(...)` plus "posted by X" under each notice. If `author_id` is null, render "posted before authors were recorded" rather than a blank — old rows have no author and that is not an error.

- [ ] **Step 8: Tolerate the migration not being applied yet**

Migration 0013 is unexecuted. Until it runs, selecting `author_id` or `target_role` fails. Wrap the `/admin` notices query so a failure renders the notices card's error state rather than taking down the page, and confirm by reading the code that a missing column produces the card's error branch and not a crash.

- [ ] **Step 9: Verify**

```bash
node --test "src/**/*.test.mts"   # 15 passing
npx tsc --noEmit
npm run lint
npm run build                      # 17 route rows still
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Give notices an author, a role audience, and a real dismiss

postNotice now takes a target role validated against an allow-list, and sets
author_id from the session rather than the payload so a manager cannot post
under someone else's name.

dismissNotice is split in two, because one button was doing both jobs and
naming only the harmless one. deleteNotice removes a notice for everyone and is
restricted to managers and admins. dismissNoticeForSelf hides it for the caller
and is open to staff, since clearing your own board is not an administrative
act.

describeAudience is pure and tested: the audience is what an admin most needs
to be sure of before posting."
```

---

### Task 3: The `/dashboard` layout, sidebar and overview

**Files:**
- Create: `src/app/dashboard/layout.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/components/dashboard/employee-sidebar.tsx`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: the layout at `/dashboard` providing the sidebar, header and a `<main>`; `EmployeeSidebar({ siteName })` navigating by URL. Tasks 4 and 5 render inside this layout.

- [ ] **Step 1: Read the page you are splitting**

```bash
cat src/app/dashboard/page.tsx
cat src/components/dashboard/employee-sidebar.tsx
```

Note four things to preserve: the not-signed-in branch, the no-employee-row branch, the `OrgSuspended` branch, and the `md:flex` container (an unconditional `flex` put the mobile rail beside the content — doc 14).

- [ ] **Step 2: Create the layout**

Create `src/app/dashboard/layout.tsx`. It owns everything shared and performs all three guard branches, so no page repeats them:

```tsx
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { DISPLAY_LOCALE, ORG_TIME_ZONE } from "@/lib/timezone";
import { OrgSuspended } from "@/components/org-suspended";
import { EmployeeSidebar } from "@/components/dashboard/employee-sidebar";
import { SignOutButton } from "./sign-out-button";

/**
 * Shared chrome for every staff route.
 *
 * The guards live here rather than in each page: signed-out, no employee row,
 * and suspended organization are properties of the person, not of the page they
 * asked for. `getEmployeeContext` is wrapped in `perRequest`, so the layout and
 * the page calling it cost one round trip per navigation, not two.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">
          You need to be signed in to view your dashboard.
        </p>
        <Link href="/login" className="text-primary underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  const employee = await getEmployeeContext();

  if (!employee) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">
          Your account (<span className="font-mono">{user.email}</span>) isn&apos;t
          linked to an organization yet.
        </p>
        <p className="text-sm text-muted-foreground">
          Ask your admin to add you as an employee, or{" "}
          <Link href="/onboarding" className="text-primary underline">
            set up your own organization
          </Link>
          .
        </p>
        <SignOutButton />
      </div>
    );
  }

  if (employee.orgSuspendedAt) {
    return (
      <OrgSuspended
        orgName={employee.orgName}
        reason={employee.orgSuspendedReason}
      />
    );
  }

  const firstName = employee.fullName.split(" ")[0];
  const today = new Date().toLocaleDateString(DISPLAY_LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: ORG_TIME_ZONE,
  });

  return (
    // A row only from md up. Unconditional `flex` makes the mobile rail a flex
    // ITEM of the row, so it sits beside the content instead of above it — see
    // doc 14. Do not change this to `flex`.
    <div className="min-h-screen bg-secondary/20 md:flex">
      <EmployeeSidebar siteName={employee.siteName} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
            <div>
              <div className="font-serif text-xl">Hi, {firstName}</div>
              <div className="text-sm text-muted-foreground">{today}</div>
            </div>
            <SignOutButton />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Reduce the page to the overview**

Rewrite `src/app/dashboard/page.tsx` so it renders **only** the clock-in widget. Delete the three guard branches (the layout owns them), the header, the sidebar and the shifts/attendance/leave cards. Keep exactly the two queries the widget needs — the employee's site geofence and their most recent event — and keep their `error` handling.

The widget's props are unchanged: `siteName`, `geofence` (`{ lat, lng, radiusM }` or null) and `initialLastEvent`.

- [ ] **Step 4: Convert the sidebar to routes**

In `src/components/dashboard/employee-sidebar.tsx`:

- Replace `SECTIONS` ids with hrefs:

```ts
const SECTIONS = [
  { href: "/dashboard", label: "Clock in", icon: Fingerprint },
  { href: "/dashboard/shifts", label: "Shifts", icon: CalendarClock },
  { href: "/dashboard/attendance", label: "History", icon: History },
  { href: "/dashboard/leave", label: "Leave", icon: Palmtree },
] as const;
```

- Delete `useActiveSection` and its `IntersectionObserver` entirely — with real routes the active item is the URL.
- Use `usePathname()`. Match exactly for `/dashboard` and by prefix for the rest, or `/dashboard` stays highlighted on every child route:

```ts
const active = (href: string) =>
  href === "/dashboard" ? pathname === href : pathname.startsWith(href);
```

- Keep the sliding `layoutId` highlight, the reduced-motion fallback, and the `md:hidden` mobile rail. Change `aria-current` from `"true"` to `"page"` — these are now page links.

- [ ] **Step 5: Verify the routes work and nothing regressed**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: exit 0, still 17 route rows (the three new pages arrive in Task 4).

```bash
PORT=3260 npm start &
sleep 9
DEMO_EMAIL=staff.demo@pac.africa DEMO_PASSWORD="$DEMO_PASSWORD" npm run smoke:authed http://localhost:3260
```

Expected: 41/41. The nav labels still render and the overview still shows the clock-in widget; the three not-yet-created routes are not visited by the current script.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Give the staff dashboard a layout, and navigate by URL

The four sections were anchors in one page. The sidebar now links to real
routes and reads its active item from usePathname, so scroll-spy and its
IntersectionObserver are gone.

Guards move to the layout: signed-out, no employee row and suspended
organization are properties of the person, not of the page they asked for, and
repeating them in four pages is four places to get them wrong.

The container stays a row only from md up. Making it unconditional put the
mobile rail beside the content — doc 14."
```

---

### Task 4: The three staff pages

**Files:**
- Create: `src/app/dashboard/shifts/page.tsx`
- Create: `src/app/dashboard/attendance/page.tsx`
- Create: `src/app/dashboard/leave/page.tsx`

**Interfaces:**
- Consumes: the layout from Task 3 (provides chrome; these render only their own card).
- Produces: routes `/dashboard/shifts`, `/dashboard/attendance`, `/dashboard/leave`. Task 6 asserts all three.

Each page follows the same shape: `getEmployeeContext()`, one query, capture `error`, render a `Card`. Move the markup from the pre-split `page.tsx` (recover it with `git show HEAD~1:src/app/dashboard/page.tsx`) so the rows look identical to before.

- [ ] **Step 1: Create the shifts page**

`src/app/dashboard/shifts/page.tsx`: query `shifts` for `id, start_at, end_at` where `employee_id` is the caller, `start_at >= now`, ordered ascending. Widen the window from the old 7 days to **14 days** and title the card "Upcoming shifts" — a dedicated page can show more than a card could.

The failure branch must read differently from the empty branch:

```tsx
{shiftsFailed ? (
  <p className="py-4 text-center text-sm text-destructive">
    Couldn&apos;t load your shifts — reload before assuming you&apos;re not rostered.
  </p>
) : (
  shifts.length === 0 && (
    <p className="py-4 text-center text-sm text-muted-foreground">
      No shifts scheduled in the next 14 days.
    </p>
  )
)}
```

Render each row with `formatTime` from `@/lib/timezone` and `toLocaleDateString(DISPLAY_LOCALE, { weekday: "short", month: "short", day: "numeric", timeZone: ORG_TIME_ZONE })`, exactly as the old card did.

- [ ] **Step 2: Create the attendance page**

`src/app/dashboard/attendance/page.tsx`: query `attendance_events` for `id, event_type, occurred_at` where `employee_id` is the caller, `occurred_at >= 30 days ago`, ordered descending, `limit(50)` — again wider than the card's 7 days and 8 rows. Title it "Attendance history".

Keep the `Badge` treatment: `variant="attention"` for `check_in` rendering "In", `variant="outline"` for `check_out` rendering "Out". Failure copy: `Couldn't load your attendance history.` Empty copy: `No check-ins in the last 30 days yet.`

- [ ] **Step 3: Create the leave page**

`src/app/dashboard/leave/page.tsx`: query `leave_requests` for `id, leave_type, start_date, end_date, status` where `employee_id` is the caller, ordered by `start_date` descending, `limit(20)`. Keep `LeaveRequestDialog` in the card header and the `LEAVE_STATUS_VARIANT` badge map from the old page. Failure copy: `Couldn't load your leave requests.` Empty copy: `No leave requests yet.`

Add a note under the card, because this page will host balances later and must not imply it already does:

```tsx
<p className="text-xs text-muted-foreground">
  Leave balances aren&apos;t tracked yet — this list is every request you&apos;ve made.
</p>
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: exit 0 and **20 route rows**, including `ƒ /dashboard/shifts`, `ƒ /dashboard/attendance` and `ƒ /dashboard/leave`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the three staff pages

Shifts, attendance history and leave each get a route, one query and their own
failure state — which is the cost of splitting, paid explicitly: a failed query
must not render as 'no shifts scheduled' to someone who is rostered.

Each page shows more than its card could: shifts 14 days instead of 7, history
30 days and 50 rows instead of 7 and 8.

The leave page says plainly that balances are not tracked yet, so the page does
not imply a feature that does not exist."
```

---

### Task 5: The notices rail

**Files:**
- Create: `src/app/dashboard/notices-rail.tsx`
- Create: `src/app/dashboard/dismiss-own-notice-button.tsx`
- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `notification_dismissals` and `notifications.target_role` (Task 1); `dismissNoticeForSelf` and `describeAudience` (Task 2); the layout (Task 3).
- Produces: the rail rendered on every staff route.

- [ ] **Step 1: Create the rail**

Create `src/app/dashboard/notices-rail.tsx`:

```tsx
import { Megaphone } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { formatDate } from "@/lib/timezone";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DismissOwnNoticeButton } from "./dismiss-own-notice-button";

/** Left border per level, so severity is legible without reading the words. */
const LEVEL_BORDER: Record<string, string> = {
  critical: "border-l-2 border-l-destructive",
  warning: "border-l-2 border-l-primary",
  info: "border-l-2 border-l-border",
};

/**
 * Notices addressed to the signed-in employee.
 *
 * The audience rule — same org, site unset or matching, role unset or matching —
 * is enforced by RLS in migration 0013 and is deliberately NOT reimplemented
 * here. Two versions of one rule drift, and the version in the database is the
 * one that actually protects anything.
 */
export async function NoticesRail() {
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const supabase = await createClient();

  const [noticesRes, dismissedRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, message, level, created_at")
      .eq("org_id", employee.orgId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("notification_dismissals")
      .select("notification_id")
      .eq("employee_id", employee.id),
  ]);

  const failed = Boolean(noticesRes.error || dismissedRes.error);

  const dismissed = new Set(
    (dismissedRes.data ?? []).map((d) => d.notification_id)
  );
  const notices = (noticesRes.data ?? []).filter((n) => !dismissed.has(n.id));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Notices</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* A failed read must not render as an empty rail: an empty rail says
            "no announcements", which is a claim, not an absence of data. */}
        {failed && (
          <p className="text-sm text-destructive">
            Couldn&apos;t load notices. Reload — don&apos;t assume there are none.
          </p>
        )}

        {!failed && notices.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            Nothing from your manager right now.
          </p>
        )}

        {notices.map((notice) => (
          <div
            key={notice.id}
            className={`flex flex-col gap-2 rounded-sm bg-secondary/40 p-3 ${
              LEVEL_BORDER[notice.level] ?? LEVEL_BORDER.info
            }`}
          >
            <p className="text-sm">{notice.message}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="font-label text-muted-foreground">
                {formatDate(new Date(notice.created_at))}
              </span>
              <DismissOwnNoticeButton noticeId={notice.id} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

Note the select list omits `site_id` and `target_role`: the rail does not need them, RLS has already applied them, and a column you do not select cannot be misused. `/admin` still selects them because it displays the audience.

- [ ] **Step 2: Create the dismiss button**

`src/app/dashboard/dismiss-own-notice-button.tsx`, a client component calling `dismissNoticeForSelf`, following `src/app/admin/dismiss-notice-button.tsx`'s existing shape: loading state, `router.refresh()` on success, error surfaced, `setLoading(false)` in a `finally`. `aria-label` is `Dismiss this notice`. No confirm dialog — dismissing affects only the person clicking and is undone by an admin reposting.

- [ ] **Step 3: Put the rail in the layout**

In `src/app/dashboard/layout.tsx`, change the content column so the rail sits beside `children` at `lg` and below it under `lg`:

```tsx
<main className="mx-auto w-full max-w-6xl px-6 py-8">
  {/* Rail beside the content at lg, BELOW it under lg — not hidden. A notice
      nobody sees on a phone is the bug this feature exists to fix. */}
  <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
    <div className="min-w-0 flex-1">{children}</div>
    <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-72">
      <NoticesRail />
    </aside>
  </div>
</main>
```

`min-w-0` on the content column is required: without it a wide child sets the flex item's minimum size and pushes the page sideways — the bug fixed on the tenant page and again on this dashboard.

- [ ] **Step 4: Verify, including at mobile widths**

```bash
npx tsc --noEmit && npm run lint && npm run build
PORT=3270 npm start &
sleep 9
DEMO_EMAIL=staff.demo@pac.africa DEMO_PASSWORD="$DEMO_PASSWORD" npm run smoke:authed http://localhost:3270
```

Expected: 41/41 still passing, 20 route rows. Then confirm by hand in a browser at 390px that the rail appears **below** the content and that `document.documentElement.scrollWidth <= clientWidth`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Show staff the notices posted for them

Since 0006 the notices table has been written by admins and read by admins.
Staff now see the ones addressed to them, in a rail on every staff route — not
only the overview, which someone landing on /dashboard/leave would never see.

Audience filtering is left to RLS rather than reimplemented in TypeScript: two
versions of one rule drift. Dismissing hides a notice for the person who
clicked and nobody else.

Below lg the rail sits below the content rather than disappearing. A notice
nobody sees on a phone is the bug this feature exists to fix."
```

---

### Task 6: Extend the authenticated pass, and seed a notice

**Files:**
- Modify: `scripts/smoke-authed.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: coverage of all four routes and the rail.

- [ ] **Step 1: Navigate all four routes**

In `scripts/smoke-authed.mjs`, after the existing dashboard assertions, visit each route in turn and assert it rendered its own content and that the sidebar's active item followed the URL:

```js
const ROUTES = [
  { path: "/dashboard/shifts", expect: /upcoming shifts/i, nav: "Shifts" },
  { path: "/dashboard/attendance", expect: /attendance history/i, nav: "History" },
  { path: "/dashboard/leave", expect: /leave/i, nav: "Leave" },
];

for (const r of ROUTES) {
  await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const t = await page.evaluate(() => document.body.innerText);
  report(r.expect.test(t), `${r.path} renders its own content`);

  const current = await page.evaluate(
    () => document.querySelector('[aria-current="page"]')?.textContent?.trim() ?? null
  );
  report(current === r.nav, `${r.path} marks "${r.nav}" as the current page`, String(current));

  const of = await page.evaluate(() => ({
    s: document.documentElement.scrollWidth,
    c: document.documentElement.clientWidth,
  }));
  report(of.s <= of.c, `${r.path} no horizontal overflow`, `${of.s} <= ${of.c}`);
}
```

- [ ] **Step 2: Assert the rail is present, and positioned correctly**

Still inside the width loop, so it is checked at every width:

```js
const rail = await page.evaluate(() => {
  const main = document.querySelector("main");
  const aside = main?.querySelector("aside");
  if (!aside) return null;
  const a = aside.getBoundingClientRect();
  const content = main.querySelector("div > div");
  const c = content ? content.getBoundingClientRect() : null;
  return { top: Math.round(a.top), left: Math.round(a.left), contentTop: c ? Math.round(c.top) : null };
});
report(rail !== null, "notices rail is present on this route");
if (rail && w < 1024) {
  report(rail.contentTop !== null && rail.top >= rail.contentTop, "under lg the rail is below the content, not beside it", JSON.stringify(rail));
}
```

- [ ] **Step 3: Seed a notice so the rail has something in it**

No notice currently targets the demo account's organization, so the rail would render its empty state and prove nothing. Insert one with the service role — a one-off command, not a committed script:

```bash
node -e "
const u=process.env.NEXT_PUBLIC_SUPABASE_URL, k=process.env.SUPABASE_SERVICE_ROLE_KEY;
fetch(u+'/rest/v1/notifications',{method:'POST',headers:{apikey:k,Authorization:'Bearer '+k,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({org_id:'11111111-1111-1111-1111-111111111111',site_id:null,target_role:'staff',message:'Payroll cut-off moves to the 25th this month. Get your timesheets in.',level:'warning'})}).then(r=>r.text()).then(console.log);
"
```

Run it with `.env.local` sourced. If it fails with a missing-column error, **migration 0013 has not been applied** — say so rather than working around it.

- [ ] **Step 4: Assert the seeded notice appears**

```js
report(/payroll cut-off/i.test(text), "a targeted notice reaches the staff rail");
```

- [ ] **Step 5: Run the full suite**

```bash
node --test "src/**/*.test.mts"   # 15
npx tsc --noEmit && npm run lint && npm run build
npm run smoke                      # 107/107
DEMO_EMAIL=... DEMO_PASSWORD=... npm run smoke:authed http://localhost:<port>
```

Report the authed count as the new total — it will be higher than 41 and the exact number depends on how many assertions you added. **Do not adjust an expectation to match a failure.**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Cover the four staff routes and the notices rail

The authed pass now visits every staff route, asserts each renders its own
content, asserts the sidebar's current item follows the URL, and asserts the
rail is present everywhere and sits BELOW the content under lg rather than
beside it — the specific mistake that made the mobile dashboard 627px wide.

A notice was seeded for the demo org, because an empty rail proves nothing."
```

---

## Verification summary

Done when:

- [ ] `node --test "src/**/*.test.mts"` — 15 passing (9 tenant-summary, 6 notice-audience)
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` all exit 0
- [ ] Build shows **20 route rows** including the three new `ƒ /dashboard/*` routes
- [ ] `npm run smoke` still 107/107
- [ ] `npm run smoke:authed` passes, covering all four routes and the rail at three widths
- [ ] `grep -rn "IntersectionObserver" src/components/dashboard/` returns nothing — scroll-spy is gone
- [ ] `git status --short supabase/migrations/` shows only 0013 as new; 0001–0012 untouched

**Explicitly not done, and not to be claimed:** migration 0013 is unexecuted at the end of this plan unless an operator applies it. The post-notice dialog's role selector and the manager site restriction cannot be exercised without an admin login, which the demo account is not.
