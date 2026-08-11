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

const DAYS = [
  { key: "2026-08-09", label: "9 Aug" },
  { key: "2026-08-10", label: "10 Aug" },
];

test("counts staff, sites and punches", () => {
  const s = summariseTenant({
    days: DAYS,
    sites: SITES,
    employees: EMPLOYEES,
    events: [
      { employee_id: "e1", occurred_at: new Date(2026, 7, 10, 7, 0).toISOString(), day_key: "2026-08-10" },
      { employee_id: "e1", occurred_at: new Date(2026, 7, 10, 16, 0).toISOString(), day_key: "2026-08-10" },
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
      { employee_id: "e1", occurred_at: new Date(2026, 7, 10, 7, 0).toISOString(), day_key: "2026-08-10" },
      { employee_id: "e1", occurred_at: new Date(2026, 7, 10, 16, 0).toISOString(), day_key: "2026-08-10" },
      { employee_id: "e2", occurred_at: new Date(2026, 7, 10, 8, 0).toISOString(), day_key: "2026-08-10" },
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
      { employee_id: "e1", occurred_at: late, day_key: "2026-08-10" },
      { employee_id: "e1", occurred_at: early, day_key: "2026-08-09" },
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
    events: [{ employee_id: "gone", occurred_at: new Date(2026, 7, 10, 7, 0).toISOString(), day_key: "2026-08-10" }],
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
      { employee_id: "e1", occurred_at: new Date(2026, 7, 10, 7, 0).toISOString(), day_key: "2026-08-10" },
      { employee_id: "e2", occurred_at: new Date(2026, 7, 10, 8, 0).toISOString(), day_key: "2026-08-10" },
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
