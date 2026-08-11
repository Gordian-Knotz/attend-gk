# /super Tenant Detail Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-tenant page at `/super/orgs/[id]` so the platform console can answer questions about a single organization, and move the commercial controls onto it.

**Architecture:** A server-rendered route segment under the existing `/super` layout. Four RLS-scoped Supabase reads run in one `Promise.all`; all derived figures are computed in memory by a pure module so they can be tested without a database. The overview table becomes navigation.

**Tech Stack:** Next 15 App Router (server components), Supabase JS, Tailwind 4, `node --test` for unit tests (built into Node 24 — no new dependency).

## Global Constraints

- **No migration.** Build only on `organizations`, `sites`, `employees`, `attendance_events` as they exist today.
- **Never select `pay_rate` or `employment_type`.** Omit from the `select` string itself, not from the template.
- **Never show individual attendance records or leave requests.** Aggregates and roster identity only.
- **Every query captures its `error`.** Any failure renders a critical `Callout`; a failed read must never render as an empty tenant.
- **`perRequest` caching only.** Org-scoped data must never touch `cachePlatformAggregate`.
- **Timezone:** all date bucketing and display go through `src/lib/timezone.ts` / `localDateKey`. Never `toISOString().slice(0,10)`.
- Follow the existing action-result convention: server actions return **fresh object literals** (`{ error: "..." }` / `{ success: true as const }`) so call sites can read `result?.error`.
- **Route count is 16 before this plan, 17 after Task 3.** Docs 12 and 13 and this plan originally said "19 routes"; that figure was never true on this branch — the build's table has 16 rows and `src/app` holds 15 `page.tsx` files plus the generated `/_not-found`. Caught during Task 2. Use 16/17.

---

### Task 1: Pure tenant summary module

Everything the page derives from raw rows, in one testable place with no Supabase import. Node 24 strips TypeScript natively, so this is real TDD with no new dependency.

> **Why `.mts` and not `.test.ts`.** Both obvious spellings were tried and both
> fail:
>
> - A `.test.ts` file is treated as CommonJS (the package has no
>   `"type": "module"`), so `import { x } from "./tenant-summary.ts"` dies in
>   the CJS resolver.
> - `tsc` rejects the explicit `.ts` extension in an import specifier —
>   `TS5097: An import path can only end with a '.ts' extension when
>   'allowImportingTsExtensions' is enabled`.
>
> `.mts` fixes both at once: Node treats it as ES module TypeScript, and the
> tsconfig `include` glob is `**/*.ts`, which does not match `.mts` — so `tsc`
> never sees the file and there is no config change to make.
>
> **The trade-off, stated:** test files are therefore *not* typechecked. A wrong
> type in an assertion surfaces when the test runs, not when `tsc` does. That is
> acceptable for assertions over a pure function; it would not be acceptable for
> production code.
>
> Also note `node --test <directory>` does **not** work here — it fails with
> `Cannot find module`. Pass the glob, quoted, exactly as the steps below do.

**Files:**
- Create: `src/lib/tenant-summary.ts`
- Create: `src/lib/tenant-summary.test.mts`  ← **`.mts`, not `.ts`** — see the note below.
- Modify: `package.json` (add the `test` script)

> **AMENDED DURING EXECUTION — 11 Aug.** The code below as originally written
> imports `localDateKey` and `formatDate`. **It cannot.** The implementer found
> that `@/` is a tsconfig alias Node knows nothing about, so it does not resolve
> under `node --test`; an extensionless relative import fails Node's ESM
> resolver; and a relative import carrying `.ts` fails `tsc` with TS5097. No
> spelling satisfies both tools.
>
> Ruling: **the module imports nothing.** The timezone-sensitive work moves to
> the caller, which is a better boundary anyway — one place applies the org
> timezone. Three signature changes, and the committed code is the record:
>
> - `TenantEvent` gains `day_key: string`, supplied by the caller via
>   `localDateKey`. The module must **not** derive it from `occurred_at`, which
>   would reintroduce UTC bucketing.
> - `days` becomes `{ key: string; label: string }[]` instead of `Date[]`.
> - `usageSeries` maps over those keys and labels directly.
>
> Task 3's code below already reflects this. The tests keep all nine cases and
> every assertion; only the fixture shape changes.
>
> **The two code blocks in Task 1 below are the ORIGINAL, superseded text.** They
> still show `days: Date[]`, events without `day_key`, and the two imports that
> cannot resolve. **Do not copy them.** They are left in place because this plan
> is a record of what was planned, and the amendment above is the record of why
> it changed — but the shipped contract lives in
> `src/lib/tenant-summary.ts` and `src/lib/tenant-summary.test.mts`, which is
> where you should read it. Rewriting the blocks here would just create a second
> copy to keep in sync, which is the problem, not the fix.

**Interfaces:**
- Consumes: **nothing.** The module is import-free by design (see the amendment above).
- Produces: `summariseTenant(input): TenantSummary`, plus the types `TenantEmployee`, `TenantSite`, `TenantEvent`, `RosterRow`, `TenantSummary`. Task 3 imports all of these.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tenant-summary.test.mts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { summariseTenant } from "./tenant-summary.ts";

const SITES = [
  { id: "site-a", name: "Westlands", geofence_lat: -1.26, geofence_lng: 36.81, geofence_radius_m: 150 },
  { id: "site-b", name: "Mombasa Road", geofence_lat: -1.31, geofence_lng: 36.87, geofence_radius_m: 200 },
];

const EMPLOYEES = [
  { id: "e1", full_name: "Amina Yusuf", role: "org_admin", site_id: "site-a" },
  { id: "e2", full_name: "Brian Otieno", role: "staff", site_id: "site-a" },
  { id: "e3", full_name: "Chege Mwangi", role: "staff", site_id: null },
];

/** Two fixed local midnights, so the series has a known length and order. */
const DAYS = [new Date(2026, 7, 9), new Date(2026, 7, 10)];

test("counts staff, sites and punches", () => {
  const s = summariseTenant({
    days: DAYS,
    sites: SITES,
    employees: EMPLOYEES,
    events: [
      { employee_id: "e1", occurred_at: new Date(2026, 7, 10, 7, 0).toISOString() },
      { employee_id: "e1", occurred_at: new Date(2026, 7, 10, 16, 0).toISOString() },
    ],
  });

  assert.equal(s.totalStaff, 3);
  assert.equal(s.siteCount, 2);
  assert.equal(s.totalPunches, 2);
});

test("active staff counts distinct people, not punches", () => {
  const s = summariseTenant({
    days: DAYS,
    sites: SITES,
    employees: EMPLOYEES,
    events: [
      { employee_id: "e1", occurred_at: new Date(2026, 7, 10, 7, 0).toISOString() },
      { employee_id: "e1", occurred_at: new Date(2026, 7, 10, 16, 0).toISOString() },
      { employee_id: "e2", occurred_at: new Date(2026, 7, 10, 8, 0).toISOString() },
    ],
  });

  // Three punches, two people. This is the number that separates a tenant
  // who rolled out from one who signed up.
  assert.equal(s.totalPunches, 3);
  assert.equal(s.activeStaff, 2);
});

test("last seen is the latest punch per employee", () => {
  const early = new Date(2026, 7, 9, 7, 0).toISOString();
  const late = new Date(2026, 7, 10, 18, 30).toISOString();

  const s = summariseTenant({
    days: DAYS,
    sites: SITES,
    employees: EMPLOYEES,
    events: [
      { employee_id: "e1", occurred_at: late },
      { employee_id: "e1", occurred_at: early },
    ],
  });

  const amina = s.roster.find((r) => r.id === "e1");
  assert.equal(amina?.lastSeen, late);
});

test("roster resolves site names and tolerates an unassigned employee", () => {
  const s = summariseTenant({ days: DAYS, sites: SITES, employees: EMPLOYEES, events: [] });

  assert.equal(s.roster.find((r) => r.id === "e2")?.siteName, "Westlands");
  assert.equal(s.roster.find((r) => r.id === "e3")?.siteName, null);
  assert.equal(s.roster.find((r) => r.id === "e3")?.lastSeen, null);
});

test("admins sort first, then by name", () => {
  const s = summariseTenant({ days: DAYS, sites: SITES, employees: EMPLOYEES, events: [] });
  assert.deepEqual(s.roster.map((r) => r.id), ["e1", "e2", "e3"]);
});

test("staff per site excludes the unassigned", () => {
  const s = summariseTenant({ days: DAYS, sites: SITES, employees: EMPLOYEES, events: [] });
  assert.equal(s.staffBySite["site-a"], 2);
  assert.equal(s.staffBySite["site-b"] ?? 0, 0);
});

test("events for someone no longer on the roster are ignored", () => {
  // An employee row can be removed while their punches remain. Counting the
  // orphan would make active staff exceed total staff.
  const s = summariseTenant({
    days: DAYS,
    sites: SITES,
    employees: EMPLOYEES,
    events: [{ employee_id: "gone", occurred_at: new Date(2026, 7, 10, 7, 0).toISOString() }],
  });

  assert.equal(s.activeStaff, 0);
  assert.equal(s.totalPunches, 1);
});

test("usage series has one point per day, in order", () => {
  const s = summariseTenant({
    days: DAYS,
    sites: SITES,
    employees: EMPLOYEES,
    events: [
      { employee_id: "e1", occurred_at: new Date(2026, 7, 10, 7, 0).toISOString() },
      { employee_id: "e2", occurred_at: new Date(2026, 7, 10, 8, 0).toISOString() },
    ],
  });

  assert.equal(s.usageSeries.length, 2);
  assert.equal(s.usageSeries[0].value, 0);
  assert.equal(s.usageSeries[1].value, 2);
});

test("an empty tenant summarises to zeroes rather than throwing", () => {
  const s = summariseTenant({ days: DAYS, sites: [], employees: [], events: [] });

  assert.equal(s.totalStaff, 0);
  assert.equal(s.activeStaff, 0);
  assert.equal(s.siteCount, 0);
  assert.deepEqual(s.roster, []);
  assert.equal(s.usageSeries.length, 2);
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
node --test "src/**/*.test.mts"
```

Expected: FAIL — `Cannot find module './tenant-summary.ts'`.

(A "Reparsing as ES module" warning is printed. It is cosmetic; do **not** add `"type": "module"` to `package.json` to silence it, as that changes module resolution for the whole Next build.)

- [ ] **Step 3: Write the implementation**

Create `src/lib/tenant-summary.ts`:

```ts
import { localDateKey } from "@/lib/attendance-series";
import { formatDate } from "@/lib/timezone";

/**
 * Everything `/super/orgs/[id]` derives from raw tenant rows.
 *
 * Pure and Supabase-free on purpose: these are the figures someone makes a
 * commercial decision on — whether a tenant has actually rolled out, whether
 * to chase them — so they are worth testing without standing up a database.
 *
 * Note what is absent. There is no `pay_rate` and no `employment_type` in
 * `TenantEmployee`, and there is no per-punch detail in the output. The vendor
 * console shows aggregates and roster identity; it does not reconstruct an
 * individual's movements. See the design spec dated 2026-08-11.
 */

export type TenantSite = {
  id: string;
  name: string;
  geofence_lat: number;
  geofence_lng: number;
  geofence_radius_m: number;
};

export type TenantEmployee = {
  id: string;
  full_name: string;
  role: string;
  site_id: string | null;
};

export type TenantEvent = {
  employee_id: string;
  occurred_at: string;
};

export type RosterRow = {
  id: string;
  fullName: string;
  role: string;
  siteName: string | null;
  /** ISO timestamp of their most recent punch in the window, or null. */
  lastSeen: string | null;
};

export type UsagePoint = {
  /** Short axis label, e.g. "12 Aug" */
  label: string;
  value: number;
};

export type TenantSummary = {
  totalStaff: number;
  /** Distinct employees with at least one punch in the window. */
  activeStaff: number;
  totalPunches: number;
  siteCount: number;
  staffBySite: Record<string, number>;
  roster: RosterRow[];
  usageSeries: UsagePoint[];
};

/** Admins first, then managers, then everyone else; alphabetical within a rank. */
const ROLE_RANK: Record<string, number> = {
  super_admin: 0,
  org_admin: 1,
  manager: 2,
  staff: 3,
};

export function summariseTenant(input: {
  /** Local midnights, oldest first — from `recentDays()`. */
  days: Date[];
  sites: TenantSite[];
  employees: TenantEmployee[];
  events: TenantEvent[];
}): TenantSummary {
  const { days, sites, employees, events } = input;

  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));

  const staffBySite: Record<string, number> = {};
  for (const e of employees) {
    if (!e.site_id) continue;
    staffBySite[e.site_id] = (staffBySite[e.site_id] ?? 0) + 1;
  }

  const onRoster = new Set(employees.map((e) => e.id));

  const lastSeenById = new Map<string, string>();
  const punchesByDay = new Map<string, number>();

  for (const ev of events) {
    const key = localDateKey(new Date(ev.occurred_at));
    punchesByDay.set(key, (punchesByDay.get(key) ?? 0) + 1);

    // ISO-8601 strings from the same source compare correctly as strings.
    const seen = lastSeenById.get(ev.employee_id);
    if (!seen || ev.occurred_at > seen) {
      lastSeenById.set(ev.employee_id, ev.occurred_at);
    }
  }

  // Counted against the roster, so punches left behind by a removed employee
  // can't push active staff above total staff.
  let activeStaff = 0;
  for (const id of lastSeenById.keys()) {
    if (onRoster.has(id)) activeStaff++;
  }

  const roster: RosterRow[] = employees
    .map((e) => ({
      id: e.id,
      fullName: e.full_name,
      role: e.role,
      siteName: e.site_id ? siteNameById.get(e.site_id) ?? null : null,
      lastSeen: lastSeenById.get(e.id) ?? null,
    }))
    .sort((a, b) => {
      const rank = (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9);
      return rank !== 0 ? rank : a.fullName.localeCompare(b.fullName);
    });

  const usageSeries: UsagePoint[] = days.map((day) => ({
    label: formatDate(day).replace(/ \d{4}$/, ""),
    value: punchesByDay.get(localDateKey(day)) ?? 0,
  }));

  return {
    totalStaff: employees.length,
    activeStaff,
    totalPunches: events.length,
    siteCount: sites.length,
    staffBySite,
    roster,
    usageSeries,
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
node --test "src/**/*.test.mts"
```

Expected: PASS, 9/9.

- [ ] **Step 5: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "node --test \"src/**/*.test.mts\""
```

Then confirm `npm test` discovers and passes the same 9 tests.

- [ ] **Step 6: Verify types and lint still pass**

```bash
npx tsc --noEmit && npm run lint
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tenant-summary.ts src/lib/tenant-summary.test.mts package.json
git commit -m "Add a tested, pure tenant summary module

Derives everything /super/orgs/[id] shows from raw rows: staff and site
counts, distinct active staff, per-employee last seen, per-site headcount
and a daily punch series.

Pure and Supabase-free so it can be tested without a database, which these
figures deserve — they are what a commercial decision gets made on. Tests
run on node --test, which handles TypeScript natively on Node 24, so this
adds no dependency.

Note what the types omit: no pay_rate, no employment_type, no per-punch
detail. The console shows aggregates and roster identity and stops there."
```

---

### Task 2: Generalise the daily chart

`SignupTrendChart` already renders a labelled daily series; the tenant page needs the same shape for punches. The spec's instruction is to rename rather than add a third chart.

**Files:**
- Create: `src/components/charts/daily-trend-chart.tsx`
- Delete: `src/components/charts/signup-trend-chart.tsx`
- Modify: `src/app/super/page.tsx` (the one existing caller)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `DailyTrendChart({ data, label })` where `data: { label: string; value: number }[]` and `label` is the singular noun for the tooltip and total, e.g. `"signup"` or `"punch"`. Task 3 renders it.

- [ ] **Step 1: Read the existing chart**

```bash
cat src/components/charts/signup-trend-chart.tsx
```

Note its `SignupPoint` type (`label`, `signups`), the empty-state branch, and the total it computes. All three behaviours must survive the rename.

- [ ] **Step 2: Create the generalised chart**

Create `src/components/charts/daily-trend-chart.tsx` as a copy of the existing file with three changes, keeping every existing style, axis, tooltip and empty-state behaviour exactly as-is:

1. Rename the component `SignupTrendChart` → `DailyTrendChart`.
2. Rename the point type `SignupPoint` → `DailyPoint`, and its `signups` field → `value`. Update the `<Area>`/`<Line>` `dataKey` accordingly.
3. Add a required `label: string` prop (singular noun). Use it wherever the old file hard-coded "signup"/"signups", pluralising with `${label}s` for counts other than 1.

- [ ] **Step 3: Point the existing caller at it**

In `src/app/super/page.tsx`:

- change the import to `import { DailyTrendChart } from "@/components/charts/daily-trend-chart";`
- change the `growthSeries` mapping so each point is `{ label, value }` instead of `{ label, signups }`
- change the render to `<DailyTrendChart data={growthSeries} label="signup" />`

- [ ] **Step 4: Delete the old chart and confirm nothing references it**

```bash
rm src/components/charts/signup-trend-chart.tsx
grep -rn "SignupTrendChart\|SignupPoint\|signup-trend-chart" src/ || echo "no references remain"
```

Expected: `no references remain`.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: all exit 0, build still reports **16** route rows and a `ƒ Middleware` line. (16, not 19 — see the note under Global Constraints.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Generalise the signups chart into DailyTrendChart

It was never signup-specific — a labelled daily series with a total and an
empty state. The tenant detail page needs the same shape for punches, and
the spec's instruction was to rename rather than add a third chart that
draws the same picture.

Point type is now { label, value } and the noun is a prop."
```

---

### Task 3: The tenant detail page

**Files:**
- Create: `src/app/super/orgs/[id]/page.tsx`
- Create: `src/app/super/orgs/[id]/not-found.tsx`

**Interfaces:**
- Consumes: `summariseTenant` and its types (Task 1); `DailyTrendChart` (Task 2); `PlanSelect`, `BillingSelect`, `SuspensionButton` from `../../org-controls` — signatures are `PlanSelect({ orgId, value })`, `BillingSelect({ orgId, value })`, `SuspensionButton({ orgId, orgName, suspended })`.
- Produces: the route `/super/orgs/[id]`. Task 4 links to it.

- [ ] **Step 1: Create the not-found page**

Create `src/app/super/orgs/[id]/not-found.tsx`:

```tsx
import Link from "next/link";

import { Callout } from "@/components/callout";

export default function OrgNotFound() {
  return (
    <div className="flex flex-col gap-6">
      <Callout variant="note" label="No such organization">
        That organization doesn&apos;t exist, or it has been deleted.{" "}
        <Link href="/super" className="text-primary underline">
          Back to the platform overview
        </Link>
        .
      </Callout>
    </div>
  );
}
```

- [ ] **Step 2: Create the detail page**

Create `src/app/super/orgs/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { localDateKey, recentDays } from "@/lib/attendance-series";
import { formatDate } from "@/lib/timezone";
import { summariseTenant } from "@/lib/tenant-summary";
import { PageHeader } from "@/components/admin/page-header";
import { Callout } from "@/components/callout";
import { StatTiles } from "@/components/site/stat-tiles";
import { DailyTrendChart } from "@/components/charts/daily-trend-chart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { PlanSelect, BillingSelect, SuspensionButton } from "../../org-controls";

/** Matches the platform overview's definition of "recently active". */
const WINDOW_DAYS = 30;

const BILLING_LABEL: Record<string, string> = {
  trialing: "On trial",
  active: "Active",
  past_due: "Past due",
  canceled: "Cancelled",
};

/**
 * One tenant, for the vendor.
 *
 * Authorization is already handled three times over before this renders:
 * middleware has `/super` in PROTECTED_PATHS, the /super layout redirects
 * anyone who is not super_admin, and each action re-checks the role. This page
 * adds no check of its own by design — a fourth copy would be a fourth thing
 * to keep in sync.
 *
 * The select lists below deliberately omit `pay_rate` and `employment_type`.
 * A column that never leaves Postgres cannot leak through a prop.
 */
export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const now = new Date();

  // `summariseTenant` imports nothing, so the timezone-sensitive work happens
  // here and only here: day keys and labels are resolved up front, and every
  // punch is bucketed through `localDateKey` on the way in. See Task 1.
  const dayDates = recentDays(WINDOW_DAYS, now);
  const windowStart = dayDates[0];
  const days = dayDates.map((day) => ({
    key: localDateKey(day),
    label: formatDate(day).replace(/ \d{4}$/, ""),
  }));

  const [orgRes, sitesRes, employeesRes, eventsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, name, slug, plan_tier, billing_status, suspended_at, suspended_reason, created_at"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sites")
      .select("id, name, geofence_lat, geofence_lng, geofence_radius_m")
      .eq("org_id", id)
      .order("name", { ascending: true }),
    supabase
      .from("employees")
      .select("id, full_name, role, site_id")
      .eq("org_id", id),
    supabase
      .from("attendance_events")
      .select("employee_id, occurred_at")
      .eq("org_id", id)
      .gte("occurred_at", windowStart.toISOString()),
  ]);

  // A failed read here is worse than elsewhere: "0 sites, 0 staff, no usage"
  // for a healthy tenant is indistinguishable from a customer who never
  // onboarded, and someone could suspend on that misreading.
  const loadError =
    orgRes.error ?? sitesRes.error ?? employeesRes.error ?? eventsRes.error;

  if (loadError) {
    return (
      <Callout variant="critical" label="Tenant view unavailable">
        This organization&apos;s details couldn&apos;t be loaded. Reload —
        don&apos;t read the absence of rows as an empty account.
      </Callout>
    );
  }

  const org = orgRes.data;
  if (!org) notFound();

  const summary = summariseTenant({
    days,
    sites: sitesRes.data ?? [],
    employees: employeesRes.data ?? [],
    events: (eventsRes.data ?? []).map((ev) => ({
      employee_id: ev.employee_id,
      occurred_at: ev.occurred_at,
      day_key: localDateKey(new Date(ev.occurred_at)),
    })),
  });

  const suspended = Boolean(org.suspended_at);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/super"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All organizations
      </Link>

      <PageHeader
        title={org.name}
        description={`Joined ${formatDate(new Date(org.created_at))} · ${org.slug}`}
        action={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {org.plan_tier}
            </Badge>
            <Badge variant={suspended ? "destructive" : "outline"}>
              {suspended
                ? "Suspended"
                : BILLING_LABEL[org.billing_status] ?? org.billing_status}
            </Badge>
          </div>
        }
      />

      {suspended && (
        <Callout
          variant="critical"
          label="Suspended"
          meta={formatDate(new Date(org.suspended_at as string))}
        >
          {org.suspended_reason ??
            "No reason recorded. Their admins and staff see a lockout notice instead of the app."}
        </Callout>
      )}

      <StatTiles
        tiles={[
          { value: String(summary.siteCount), label: "Sites" },
          { value: String(summary.totalStaff), label: "Staff" },
          { value: String(summary.activeStaff), label: `Active in ${WINDOW_DAYS}d` },
          { value: String(summary.totalPunches), label: `Punches in ${WINDOW_DAYS}d` },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyTrendChart data={summary.usageSeries} label="punch" />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Sites</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col">
            {(sitesRes.data ?? []).length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No sites yet — this tenant hasn&apos;t set up a geofence.
              </p>
            )}
            {(sitesRes.data ?? []).map((site) => (
              <div
                key={site.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 last:border-0"
              >
                <span className="font-medium">{site.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {site.geofence_lat.toFixed(4)}, {site.geofence_lng.toFixed(4)} ·{" "}
                  {site.geofence_radius_m}m · {summary.staffBySite[site.id] ?? 0} staff
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Roster</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {summary.roster.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nobody on the roster yet.
              </p>
            )}
            {summary.roster.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.roster.map((person) => (
                    <TableRow key={person.id}>
                      <TableCell className="font-medium">{person.fullName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {person.role.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {person.siteName ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {person.lastSeen
                          ? formatDate(new Date(person.lastSeen))
                          : "Never"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Plan and billing are commercial state. Suspension locks every
            member of this organization out of the product and is reversible.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <PlanSelect orgId={org.id} value={org.plan_tier} />
            <BillingSelect orgId={org.id} value={org.billing_status} />
            <SuspensionButton
              orgId={org.id}
              orgName={org.name}
              suspended={suspended}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Confirm no forbidden column is selected**

```bash
grep -roE '\.select\(\s*"[^"]*"' src/app/super/ | grep -E "pay_rate|employment_type" || echo "clean: neither column appears in any select"
```

Expected: `clean: neither column appears in any select`.

> **Corrected during execution — 11 Aug.** This step originally grepped the file
> for the column *names*, and the implementer dutifully reworded the doc comment
> to satisfy it. Wrong way round: that comment deliberately names both columns,
> because the next person adding a field to the `select` needs to read which two
> are forbidden and why. Naming them in prose costs nothing; naming them in a
> `select` is the hazard. Test the requirement as stated — neither column is
> *selected* — not whether the words appear in the file.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: all exit 0. The build output gains a route — `ƒ /super/orgs/[id]`. Confirm it is listed as dynamic (`ƒ`), not static.

- [ ] **Step 5: Commit**

```bash
git add "src/app/super/orgs"
git commit -m "Add the tenant detail page

/super/orgs/[id]: counts, a 30-day usage chart, the site list with
geofences and per-site headcount, the roster, and the commercial controls
in a danger zone next to the organization's own name.

Four RLS-scoped reads in one Promise.all, every error captured. A failed
read renders a critical callout rather than an empty tenant, which on this
page is the difference between 'they never onboarded' and 'the database
was briefly unreachable' — and someone might suspend on that reading.

pay_rate and employment_type are absent from the select strings, not
hidden in the markup."
```

---

### Task 4: The overview becomes navigation

**Files:**
- Modify: `src/app/super/page.tsx`

**Interfaces:**
- Consumes: the route from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Link each row to its tenant**

In the organizations table body, wrap the organization name cell's contents in a link to the detail page:

```tsx
<TableCell className="pl-5">
  <Link
    href={`/super/orgs/${org.id}`}
    className="font-medium underline-offset-4 hover:text-primary hover:underline"
  >
    {org.name}
  </Link>
  <div className="font-mono text-xs text-muted-foreground">{org.slug}</div>
</TableCell>
```

Add `import Link from "next/link";` at the top if it is not already imported.

- [ ] **Step 2: Replace the inline controls with read-only badges**

Replace the plan and billing `<TableCell>`s that currently render `<PlanSelect …>` and `<BillingSelect …>` with badges, and delete the cell containing `<SuspensionButton …>` along with its now-empty `<TableHead className="w-10" />`:

```tsx
<TableCell>
  <Badge variant="outline" className="capitalize">
    {org.plan_tier}
  </Badge>
</TableCell>
<TableCell>
  <Badge variant={BILLING_VARIANT[org.billing_status] ?? "outline"}>
    {org.billing_status}
  </Badge>
</TableCell>
```

- [ ] **Step 3: Remove the now-unused import**

Delete the `import { BillingSelect, PlanSelect, SuspensionButton } from "./org-controls";` line. The components are still used — by the detail page — so do **not** delete `org-controls.tsx`.

- [ ] **Step 4: Add a line telling the operator where the controls went**

Below the Organizations `CardTitle`, add:

```tsx
<p className="text-sm text-muted-foreground">
  Open an organization to change its plan, billing or suspension.
</p>
```

Without this the controls appear to have simply vanished for anyone who used them yesterday.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: all exit 0, and `/super` gets **smaller** — it no longer pulls the select and dialog client components into the overview route.

- [ ] **Step 6: Commit**

```bash
git add src/app/super/page.tsx
git commit -m "Make the platform overview navigation, not a control panel

Organization names link to the tenant page; plan and billing become
read-only badges there.

Suspension locks an entire company out of the product, and a control that
does that sitting in row 14 of a dense table is a misclick with a customer
on the other end. It now lives next to the name of the organization it
applies to. The overview also gets lighter: the select and dialog client
components are no longer pulled into it."
```

---

### Task 5: Look at it, then delete the fixture

`/super` needs a `super_admin` session, so the smoke script cannot reach it. Doc 09 established the pattern: render the same components against fixture data on a temporary route, check it, delete the route. This avoids creating an account in a live tenant's database purely to see a layout.

**Files:**
- Create then delete: `src/app/super-check/page.tsx`

**Interfaces:**
- Consumes: `DailyTrendChart` (Task 2), the presentational parts of Task 3.
- Produces: nothing. The route must not exist at the end of this task.

- [ ] **Step 1: Create the fixture route**

Create `src/app/super-check/page.tsx`. Copy the JSX from
`src/app/super/orgs/[id]/page.tsx` — everything from the back-link down to the
danger-zone card — and replace the four queries and the `summariseTenant` call
with this fixture. Do **not** import the real page, and do not query Supabase.

```tsx
// TEMPORARY — delete this route once the layout has been checked. See doc 09.
const ORG = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Alpha Pride Security Services Limited",
  slug: "alpha-pride-security",
  plan_tier: "pro",
  billing_status: "past_due",
  suspended_at: new Date(2026, 7, 8).toISOString(),
  suspended_reason: "Invoice 41 unpaid for 62 days.",
  created_at: new Date(2026, 1, 14).toISOString(),
};

const SITES = [
  { id: "s1", name: "Westlands Head Office and Central Dispatch Yard", geofence_lat: -1.2673, geofence_lng: 36.8103, geofence_radius_m: 150 },
  { id: "s2", name: "Mombasa Road Yard", geofence_lat: -1.3172, geofence_lng: 36.8784, geofence_radius_m: 220 },
  { id: "s3", name: "Thika", geofence_lat: -1.0332, geofence_lng: 37.0693, geofence_radius_m: 90 },
];

const SUMMARY = {
  totalStaff: 9,
  activeStaff: 6,
  totalPunches: 412,
  siteCount: 3,
  staffBySite: { s1: 5, s2: 3, s3: 0 },
  roster: [
    { id: "1", fullName: "Amina Yusuf", role: "org_admin", siteName: "Westlands Head Office and Central Dispatch Yard", lastSeen: new Date(2026, 7, 10, 7, 2).toISOString() },
    { id: "2", fullName: "Brian Otieno", role: "manager", siteName: "Mombasa Road Yard", lastSeen: new Date(2026, 7, 10, 6, 55).toISOString() },
    { id: "3", fullName: "Chege Mwangi", role: "staff", siteName: "Westlands Head Office and Central Dispatch Yard", lastSeen: new Date(2026, 7, 9, 18, 30).toISOString() },
    { id: "4", fullName: "Daniela Achieng", role: "staff", siteName: "Mombasa Road Yard", lastSeen: new Date(2026, 7, 10, 7, 15).toISOString() },
    { id: "5", fullName: "Eric Kiplagat", role: "staff", siteName: "Westlands Head Office and Central Dispatch Yard", lastSeen: null },
    { id: "6", fullName: "Faith Wanjiru", role: "staff", siteName: null, lastSeen: null },
    { id: "7", fullName: "George Njoroge", role: "staff", siteName: "Westlands Head Office and Central Dispatch Yard", lastSeen: new Date(2026, 7, 8, 7, 40).toISOString() },
    { id: "8", fullName: "Halima Abdi", role: "staff", siteName: "Mombasa Road Yard", lastSeen: new Date(2026, 7, 10, 7, 5).toISOString() },
    { id: "9", fullName: "Ian Mutiso", role: "staff", siteName: "Westlands Head Office and Central Dispatch Yard", lastSeen: new Date(2026, 7, 7, 7, 12).toISOString() },
  ],
  // 14 points is enough to see the axis behave; the real page renders 30.
  usageSeries: [12, 18, 0, 9, 22, 31, 27, 14, 0, 0, 19, 25, 30, 21].map((value, i) => ({
    label: `${i + 1} Aug`,
    value,
  })),
};
```

The fixture is deliberately awkward: a site name long enough to test
truncation, a site with zero staff, two people who have never punched, one with
no site at all, a suspended org so the banner renders, and zero-days in the
series so the chart's baseline is visible.

- [ ] **Step 2: Build and serve**

```bash
npm run build
PORT=3200 npm start
```

- [ ] **Step 3: Check it at three widths in both themes**

```bash
node scripts/smoke.mjs http://localhost:3200
```

That covers the landing page only, so additionally open `http://localhost:3200/super-check` and confirm by eye:

- no horizontal overflow at 1366, 390 and 320
- the roster table scrolls inside its own card rather than widening the page
- the danger-zone card reads as distinct in both light and dark
- the long site name truncates or wraps rather than pushing the layout
- the stat tiles read correctly with a zero in them

- [ ] **Step 4: Delete the fixture route**

```bash
rm -r src/app/super-check
npm run build
```

Expected: the route count returns to what it was after Task 3, and `/super-check` is gone from the output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Verify the tenant page layout against fixtures

Checked the detail page's composition at 1366/390/320 in both themes via a
temporary /super-check route with fixture data, then deleted it — the same
approach doc 09 used for the bento. The real page needs a super_admin
session, so the smoke script cannot reach it.

Recording the alternative that was rejected: creating a throwaway account
on the live project would have written real rows into a real tenant's
database to look at a layout."
```

---

## Verification summary

Done when:

- [ ] `npm test` passes (9 tests, `src/lib/tenant-summary.test.mts`)
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` all exit 0
- [ ] Build lists `ƒ /super/orgs/[id]` as a dynamic route
- [ ] `grep -roE '\.select\(\s*"[^"]*"' src/app/super/ | grep -E "pay_rate|employment_type"`
      returns nothing — check the `select` strings, not the file text, since the
      page's doc comment names both columns on purpose
- [ ] `/super` no longer imports `org-controls`, and its bundle is smaller than before
- [ ] `src/app/super-check/` does not exist
- [ ] `npm run smoke` passes against the public routes (107 checks after the
      theme assertions were added — it was 99 when this plan was written)

Left for a session with a real `super_admin` login, and **not claimed as done**:
an end-to-end suspend/restore round trip, and confirming an org with no sites
and no staff renders as empty rather than broken.
