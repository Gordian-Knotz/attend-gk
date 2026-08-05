import { column, Schema, Table } from "@powersync/web";

/**
 * Client-side SQLite mirror of the Postgres tables the check-in flow needs.
 *
 * Scope is deliberately one employee's own slice — their record, their
 * site's geofence, their shifts and their own attendance events. That's
 * what has to work down a mineshaft or on a site with no signal; the admin
 * dashboard is an online tool and stays server-rendered.
 *
 * Column names and types must match `powersync/sync-rules.yaml`, which must
 * in turn match the Postgres schema in `supabase/migrations/`. All three
 * drift together — change one, change all three.
 *
 * Note there is no `id` column declared anywhere below: PowerSync always
 * creates an `id` TEXT primary key on every table implicitly, and declaring
 * it again is an error.
 */

const employees = new Table(
  {
    org_id: column.text,
    site_id: column.text,
    full_name: column.text,
    role: column.text,
  },
  { indexes: {} }
);

const sites = new Table({
  org_id: column.text,
  name: column.text,
  geofence_lat: column.real,
  geofence_lng: column.real,
  geofence_radius_m: column.integer,
});

const shifts = new Table(
  {
    site_id: column.text,
    employee_id: column.text,
    start_at: column.text,
    end_at: column.text,
    status: column.text,
  },
  { indexes: { by_start: ["start_at"] } }
);

/**
 * `insertOnly` because attendance is an append-only ledger — a punch is
 * never edited or deleted from the device. It also means PowerSync doesn't
 * keep local copies after upload, so a shared kiosk browser isn't
 * accumulating other people's history on disk.
 */
const attendance_events = new Table(
  {
    employee_id: column.text,
    org_id: column.text,
    site_id: column.text,
    source: column.text,
    event_type: column.text,
    occurred_at: column.text,
    gps_lat: column.real,
    gps_lng: column.real,
    distance_m: column.real,
  },
  { insertOnly: true }
);

export const AppSchema = new Schema({
  employees,
  sites,
  shifts,
  attendance_events,
});

export type Database = (typeof AppSchema)["types"];
export type EmployeeRecord = Database["employees"];
export type SiteRecord = Database["sites"];
export type ShiftRecord = Database["shifts"];
export type AttendanceEventRecord = Database["attendance_events"];
