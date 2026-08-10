// Populates realistic demo data for AttendPAC: extra sites, one biometric
// device per site, ~15 demo staff accounts (real auth.users, via the Admin
// API — this is why it needs the service role key and has to run locally,
// not from a sandboxed CI/agent environment), 7 days of attendance history
// with a believable mix of present/late/absent/on-leave outcomes, and the
// next 7 days of scheduled shifts.
//
// Usage:
//   node --env-file=.env.local scripts/seed-demo-data.mjs
//
// Safe to re-run — it skips creating a site/user if one with the same
// name/email already exists, though it will add another week of
// attendance_events each time (harmless for a demo, just more history).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/seed-demo-data.mjs"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_PASSWORD = "Demo1234!";

const SITES = [
  { name: "Two Rivers Mall", lat: -1.2173, lng: 36.8784, radius: 150 },
  { name: "Garden City", lat: -1.2246, lng: 36.8783, radius: 150 },
  { name: "Industrial Area Warehouse", lat: -1.3095, lng: 36.8514, radius: 200 },
  { name: "Karen Residence", lat: -1.3197, lng: 36.7076, radius: 120 },
];

const STAFF = [
  { name: "Wanjiku Mwangi", role: "manager", site: "Two Rivers Mall" },
  { name: "Otieno Kamau", role: "staff", site: "Two Rivers Mall" },
  { name: "Njoroge Peter", role: "staff", site: "Two Rivers Mall" },
  { name: "Achieng Diana", role: "staff", site: "Two Rivers Mall" },
  { name: "Cherono Faith", role: "manager", site: "Garden City" },
  { name: "Wekesa Brian", role: "staff", site: "Garden City" },
  { name: "Nekesa Grace", role: "staff", site: "Garden City" },
  { name: "Mutiso John", role: "manager", site: "Industrial Area Warehouse" },
  { name: "Kiptoo Daniel", role: "staff", site: "Industrial Area Warehouse" },
  { name: "Auma Sharon", role: "staff", site: "Industrial Area Warehouse" },
  { name: "Kamotho Eric", role: "staff", site: "Industrial Area Warehouse" },
  { name: "Chebet Ann", role: "manager", site: "Karen Residence" },
  { name: "Odhiambo Collins", role: "staff", site: "Karen Residence" },
  { name: "Wairimu Lucy", role: "staff", site: "Karen Residence" },
];

const DAYS_OF_HISTORY = 7;

function slugifyEmail(name, i) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z]+/g, ".")
      .replace(/^\.|\.$/g, "") + `+demo${i}@attendpac.test`
  );
}

/** `YYYY-MM-DD` from the local calendar date. Mirrors localDateKey() in
 *  src/lib/attendance-series.ts; duplicated because this is a plain .mjs
 *  script with no TypeScript build step. */
function localDateKey(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function jitter(value, meters) {
  // ~1 degree lat ≈ 111,000m; good enough jitter for demo GPS points
  return value + (Math.random() - 0.5) * (meters / 111000);
}

function randomTimeOn(date, hour, minuteSpread) {
  const d = new Date(date);
  d.setHours(hour, Math.floor(Math.random() * minuteSpread), 0, 0);
  return d;
}

async function main() {
  console.log("Looking up the demo organization…");
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "alpha-pride-security")
    .single();

  if (orgError || !org) {
    console.error(
      "Couldn't find the 'alpha-pride-security' org — run supabase/seed.sql first."
    );
    process.exit(1);
  }

  console.log(`Org: ${org.id}`);

  console.log("Ensuring sites exist…");
  const siteIdByName = {};
  for (const s of SITES) {
    const { data: existing } = await supabase
      .from("sites")
      .select("id")
      .eq("org_id", org.id)
      .eq("name", s.name)
      .maybeSingle();

    if (existing) {
      siteIdByName[s.name] = existing.id;
      continue;
    }

    const { data: created, error } = await supabase
      .from("sites")
      .insert({
        org_id: org.id,
        name: s.name,
        geofence_lat: s.lat,
        geofence_lng: s.lng,
        geofence_radius_m: s.radius,
      })
      .select("id")
      .single();

    if (error) throw error;
    siteIdByName[s.name] = created.id;
    console.log(`  + ${s.name}`);
  }

  console.log("Registering demo biometric devices…");
  const deviceModels = ["ZKTeco SpeedFace V5L", "ZKTeco uFace 800", "Hikvision DS-K1T331"];
  let deviceCount = 0;
  for (const s of SITES) {
    const { data: existing } = await supabase
      .from("biometric_devices")
      .select("id")
      .eq("org_id", org.id)
      .eq("site_id", siteIdByName[s.name])
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from("biometric_devices").insert({
      org_id: org.id,
      site_id: siteIdByName[s.name],
      device_id: `ZK-${s.name.replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase()}-01`,
      model: deviceModels[Math.floor(Math.random() * deviceModels.length)],
      last_seen_at: new Date(Date.now() - Math.random() * 3600 * 1000).toISOString(),
    });
    if (error) throw error;
    deviceCount++;
    console.log(`  + device at ${s.name}`);
  }

  console.log("Creating demo staff accounts…");

  // Fetched once, paginated. This used to call listUsers() inside the loop
  // — one full user listing per staff member — and read only the default
  // first page, so past 50 users it stopped finding existing accounts and
  // tried to recreate them on every run.
  const existingUsers = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const batch = data?.users ?? [];
    for (const u of batch) {
      if (u.email) existingUsers.set(u.email.toLowerCase(), u);
    }
    if (batch.length < 200) break;
  }

  const employees = [];
  for (let i = 0; i < STAFF.length; i++) {
    const person = STAFF[i];
    const email = slugifyEmail(person.name, i);

    let authUser = existingUsers.get(email.toLowerCase());

    if (!authUser) {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email,
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      authUser = created.user;
      console.log(`  + auth user ${email}`);
    }

    const { data: existingEmployee } = await supabase
      .from("employees")
      .select("id")
      .eq("id", authUser.id)
      .maybeSingle();

    if (!existingEmployee) {
      const { error } = await supabase.from("employees").insert({
        id: authUser.id,
        org_id: org.id,
        site_id: siteIdByName[person.site],
        full_name: person.name,
        role: person.role,
      });
      if (error) throw error;
      console.log(`  + employee ${person.name} (${person.role}, ${person.site})`);
    }

    employees.push({ ...person, id: authUser.id, email, siteId: siteIdByName[person.site] });
  }

  console.log(`Generating ${DAYS_OF_HISTORY} days of attendance history…`);
  const events = [];
  const leaveRequests = [];

  for (const emp of employees) {
    const site = SITES.find((s) => s.name === emp.site);

    for (let d = 0; d < DAYS_OF_HISTORY; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      date.setHours(0, 0, 0, 0);

      const day = date.getDay();
      if (day === 0 || day === 6) continue; // skip weekends

      const roll = Math.random();
      let outcome;
      if (roll < 0.78) outcome = "present";
      else if (roll < 0.9) outcome = "late";
      else if (roll < 0.96) outcome = "on_leave";
      else outcome = "absent";

      if (outcome === "absent") continue;

      if (outcome === "on_leave") {
        // Local date parts, not toISOString(): `date` is local midnight, so
        // in any zone ahead of UTC the ISO slice is the *previous* day — and
        // the leave row then wouldn't line up with the attendance generated
        // for the same iteration.
        const iso = localDateKey(date);
        leaveRequests.push({
          employee_id: emp.id,
          org_id: org.id,
          leave_type: "annual",
          start_date: iso,
          end_date: iso,
          status: "approved",
        });
        continue;
      }

      // classifyCheckIn's cutoff is 07:15, so a "late" punch generated in
      // the 07:00–07:45 window landed before the cutoff about a third of
      // the time and rendered as present — making the seeded data disagree
      // with its own labels. Late now starts at 07:16.
      const checkIn =
        outcome === "late"
          ? new Date(randomTimeOn(date, 7, 44).getTime() + 16 * 60 * 1000)
          : randomTimeOn(date, 6, 60);
      const checkOut = randomTimeOn(date, 17, 30);

      const lat = jitter(site.lat, 40);
      const lng = jitter(site.lng, 40);

      events.push({
        employee_id: emp.id,
        org_id: org.id,
        site_id: emp.siteId,
        source: "mobile",
        event_type: "check_in",
        occurred_at: checkIn.toISOString(),
        received_at: checkIn.toISOString(),
        gps_lat: lat,
        gps_lng: lng,
        distance_m: Math.round(Math.random() * 40),
      });

      // don't add a check-out for "today" for everyone — keeps some people
      // showing as currently-on-site in a live dashboard
      if (d > 0 || Math.random() < 0.5) {
        events.push({
          employee_id: emp.id,
          org_id: org.id,
          site_id: emp.siteId,
          source: "mobile",
          event_type: "check_out",
          occurred_at: checkOut.toISOString(),
          received_at: checkOut.toISOString(),
          gps_lat: jitter(site.lat, 40),
          gps_lng: jitter(site.lng, 40),
          distance_m: Math.round(Math.random() * 40),
        });
      }
    }
  }

  console.log("Scheduling the next 7 days of shifts…");
  const shifts = [];
  for (const emp of employees) {
    for (let d = 0; d < 7; d++) {
      const date = new Date();
      date.setDate(date.getDate() + d);
      date.setHours(0, 0, 0, 0);

      const day = date.getDay();
      if (day === 0 || day === 6) continue; // skip weekends

      const start = new Date(date);
      start.setHours(7, 0, 0, 0);
      const end = new Date(date);
      end.setHours(17, 0, 0, 0);

      shifts.push({
        site_id: emp.siteId,
        employee_id: emp.id,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        status: "scheduled",
      });
    }
  }
  if (shifts.length > 0) {
    const { error } = await supabase.from("shifts").insert(shifts);
    if (error) throw error;
  }

  if (events.length > 0) {
    const { error } = await supabase.from("attendance_events").insert(events);
    if (error) throw error;
  }
  if (leaveRequests.length > 0) {
    const { error } = await supabase.from("leave_requests").insert(leaveRequests);
    if (error) throw error;
  }

  console.log(`\nDone.`);
  console.log(`  Sites: ${SITES.length}`);
  console.log(`  Devices: ${deviceCount} new (${SITES.length} total expected)`);
  console.log(`  Employees: ${employees.length}`);
  console.log(`  Shifts (next 7 days): ${shifts.length}`);
  console.log(`  Attendance events: ${events.length}`);
  console.log(`  Leave requests: ${leaveRequests.length}`);
  console.log(`\nDemo login (any seeded staff account), password: ${DEMO_PASSWORD}`);
  console.log(`  Manager example: ${employees[0].email}`);
  console.log(`  Staff example:   ${employees[1].email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
