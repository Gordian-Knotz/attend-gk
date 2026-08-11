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
 *
 * Imports nothing on purpose. It was going to import `localDateKey` and
 * `formatDate`, which is unremarkable in Next but unresolvable under
 * `node --test` — `@/` is a tsconfig alias Node knows nothing about, and
 * neither relative spelling satisfies both the runtime and the typechecker.
 * Rather than reach for a loader, the timezone-sensitive work moved to the
 * caller: the page buckets each punch through `localDateKey` and resolves the
 * day labels through `formatDate` before calling in. One boundary, one place
 * the timezone is applied, and this file stays testable with zero setup.
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
  /** Local-date key ("YYYY-MM-DD") for this punch, bucketed by the CALLER
   *  through `localDateKey` so the organization's timezone is applied exactly
   *  once, at the boundary. Do not derive it in here from `occurred_at` —
   *  that would silently reintroduce UTC bucketing. */
  day_key: string;
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
  days: { key: string; label: string }[];
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
    punchesByDay.set(ev.day_key, (punchesByDay.get(ev.day_key) ?? 0) + 1);

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
    label: day.label,
    value: punchesByDay.get(day.key) ?? 0,
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
