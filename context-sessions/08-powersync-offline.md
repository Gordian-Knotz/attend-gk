# 08 — PowerSync offline sync

Status: **foundation built, not yet live.** Everything client-side is in
place; it activates when `NEXT_PUBLIC_POWERSYNC_URL` is set. Until then
`PowerSyncProvider` renders children untouched and the app runs exactly as
it did before.

## Scope

Check-in path only, chosen deliberately. Synced per device:

| Table | Rows synced |
|---|---|
| `employees` | the signed-in user's own row |
| `sites` | only the site they're assigned to |
| `shifts` | their own roster |
| `attendance_events` | **nothing downstream** — insert-only, writes go up only |

The admin dashboard is **not** synced. Pushing a whole org's attendance
history to every device is a large footprint for no offline benefit — admin
is an online tool used at a desk.

## Files

| Path | Purpose |
|---|---|
| `src/lib/powersync/schema.ts` | Client SQLite mirror of the four tables |
| `src/lib/powersync/connector.ts` | Supabase auth + write drain |
| `src/lib/powersync/provider.tsx` | Boots the DB, no-ops when unconfigured |
| `powersync/sync-rules.yaml` | Source of truth for the dashboard's copy |
| `supabase/powersync-setup.sql` | Replication role + publication (run once) |
| `supabase/migrations/0007_geofence_enforcement.sql` | Geofence moved into Postgres |

`next.config.ts` gained the Turbopack/WASM settings, `package.json` gained
`postinstall: powersync-web copy-assets -o public`, and the generated
`public/@powersync/` is gitignored.

## The security problem this surfaced, and the fix

The server-side geofence re-validation in `recordAttendance`
(`src/app/dashboard/actions.ts`) exists because Section 09 calls out GPS
spoofing and buddy punching — client-side validation alone is exactly what
those defeat.

**PowerSync bypasses it.** Its write path is local SQLite → `uploadData()`
→ PostgREST. The server action is never called, so an offline-queued punch
— which is most of them — would land with no geofence check at all.

Migration `0007` moves the rule into a `BEFORE INSERT` trigger on
`attendance_events`. That closes the hole and, usefully, makes it apply to
every write path at once: the server action, PowerSync, the future Expo
app, and the biometric webhook bridge when it exists.

> **Not sufficient on its own — found 10 Aug 2026.** The trigger is
> bypassable by a client sending `source: 'biometric'` or `site_id: null`,
> because 0001's insert policy constrains only `employee_id`. The geofence
> is therefore **not yet enforced**, and
> `NEXT_PUBLIC_POWERSYNC_URL` should stay unset until it is. Full write-up
> and the fix in [04](04-database-and-rls.md) → "Found 10 Aug 2026".

Details worth knowing:

- `distance_m` is **recomputed** in the trigger, never trusted from the
  client. It's an audit field; a spoofed value would make the log lie about
  itself.
- `source in ('manual','biometric')` is exempt — a manual admin correction
  and a fixed terminal both legitimately have no GPS.
- Rejections raise **errcode 23514**. `SupabaseConnector` treats that (and
  other permanent Postgres codes) as fatal and drops the queued write
  rather than retrying. A punch from outside the fence never becomes valid,
  and retrying forever would wedge every later punch behind it in the
  queue.
- The server action keeps its own check. It's now a fast-feedback duplicate
  rather than the enforcement point — it can return "you're 240m away"
  instead of surfacing a raised exception.

## Other decisions

**Publication is table-scoped, not `FOR ALL TABLES`.** Narrower keeps
`biometric_devices` (webhook secrets), `payroll_exports` and
`notifications` out of the replication stream entirely, rather than relying
on sync rules alone. Adding a table to the sync rules means adding it to
the publication too.

**Sync rules select explicit columns, not `*`.** `employees.pay_rate` and
`employment_type` have no business sitting on a shared kiosk device.

**`attendance_events` is `insertOnly`.** Attendance is an append-only
ledger, never edited on-device. It also means PowerSync doesn't retain
local copies after upload, so a shared kiosk browser isn't accumulating
other people's history on disk.

> **Corrected 10 Aug 2026.** The sync rules also carried an
> `own_attendance` stream, commented as syncing punches down so the client
> could "read back … currently clocked in". That could never have worked:
> an insert-only table sends local writes up and **never accepts rows
> down**, so the stream would have replicated every punch to the device for
> the client to discard. The stream has been removed and `insertOnly` kept,
> because the kiosk-privacy argument above is the stronger one. The cost is
> real and now stated in both files: once a punch uploads, the device has no
> local record of it. If step 4 needs that, drop `insertOnly` **and** restore
> the stream in the same change — one without the other is exactly the
> inconsistency this note replaced.

**The database is a module singleton**, so React Strict Mode's double
invoke in development doesn't open two SQLite connections to one file.

## What's left

1. ~~**Approve the blocked postinstall.**~~ **Closed 10 Aug 2026 — this was
   never a blocker.** Recorded in full because two sessions treated it as
   one, and the reasoning that made it look fatal was wrong in a way worth
   being able to recognise again.

   The story as it stood: npm blocked `@journeyapps/wa-sqlite`'s
   `powersync-core:download`, so `libpowersync.wasm` and
   `libpowersync-async.wasm` — named in `scripts/download-dynamic-core.js`,
   pinned at core **v0.5.2** — were absent from `dist/`. The conclusion drawn
   was that the database would fail to open at runtime, which no build could
   catch.

   Two things are now established, and they point the same way:

   - **The Web SDK never loads the builds that need those files.**
     `@powersync/web` 2.1.1 references only `wa-sqlite.mjs` and
     `wa-sqlite-async.mjs` — the **static** builds, with the PowerSync core
     linked in. It never references the `*-dynamic-main` variants, which are
     the only consumers of `libpowersync*.wasm`. Both static `.wasm` files
     are present in `public/@powersync/assets/`, put there by the
     `postinstall: powersync-web copy-assets -o public` that has been
     running all along.
   - **The script was approved, and the download 404s.** With
     `allowScripts` set in `package.json`, `npm rebuild
     @journeyapps/wa-sqlite --foreground-scripts` runs it and prints:

     ```
     Downloading libpowersync.wasm@v0.5.2
     Could not download PowerSync SQLite core for dynamic linking.
     Dynamic builds require libpowersync.wasm/libpowersync-async.wasm asset
     files. Static builds should still function correctly.
     Error: … "libpowersync.wasm". Not Found
     ```

     So the asset is not published at that version at all. npm's block was
     never what stood between us and those files, and the package's own
     error message says the static path is unaffected.

   Nothing to do. If a future SDK version opts into the dynamic core, this
   returns as an upstream packaging problem, not a local approval one.
2. **Provision.** PowerSync Cloud instance; run
   `supabase/powersync-setup.sql` on a direct Postgres connection (not
   PostgREST — the keys in `.env.local` can't do DDL or role creation), then
   the separate `ALTER ROLE powersync_role WITH LOGIN PASSWORD` with a
   password you generate; connect the instance with "Use Supabase Auth";
   deploy the sync rules; put the instance URL in `.env.local`.

   Four details that are easy to get wrong, each of which fails quietly:

   - **The publication must be named `powersync`.** PowerSync requires that
     exact name; the setup script already uses it.
   - **"Use Supabase Auth" is not just a checkbox.** A project on legacy
     HS256 keys needs its JWT Secret pasted into the Legacy field; a project
     on the newer asymmetric signing keys needs that field left **empty** so
     PowerSync auto-configures the JWKS endpoint. Get it wrong and the
     client connects and then syncs nothing.
   - **The instance must be on service version ≥ 1.20.1.** These sync rules
     use `config: edition: 3` (Sync Streams), and service-core 1.20.0 /
     sync-rules 0.32.0 ignored some filters under edition 3 —
     GHSA-q6wc-xx4m-92fj, authenticated users syncing rows they should not
     see. Our streams filter directly on `auth.user_id()` rather than using
     the affected "subquery decides whether the table syncs" shape, so they
     are probably not affected, but tenant isolation is the entire argument
     for the narrow sync scope and it is worth one version check.
   - **SSL `verify-full` needs no extra setup** — PowerSync ships Supabase's
     CA. If the connection can't resolve at all, that's the IPv6 problem:
     Supabase direct hosts are IPv6-only without the IPv4 add-on, so use the
     Supavisor session-mode host on 5432.
3. ~~**Run migration 0007 — and 0008 with it.**~~ **Done, 10 Aug 2026.**
   0008–0011 are applied to the live project; `client_event_id`,
   `contact_requests` and `organizations.suspended_at` all resolve through
   PostgREST. The insert policy now pins `org_id`, `site_id` and
   `source in ('mobile','kiosk_qr')`, so a sync upload can no longer claim
   `biometric` and skip the fence. **This was the gate on setting
   `NEXT_PUBLIC_POWERSYNC_URL`, and it is now clear.**
4. **Rewrite the check-in flow** to read and write local SQLite —
   `checkin-widget.tsx` and `/checkin`, replacing the localStorage queue.

**Turning sync on is currently safe to do early, and worth it.** Nothing in
`src/` reads or writes the local database yet — `PowerSyncProvider` in the
root layout is its only consumer. So setting the URL opens SQLite, streams
`employees`, `sites` and `shifts` down, and writes nothing at all. That
exercises auth, the connection and the sync rules end to end without
touching the write path, and the two-queues hazard below only becomes real
at step 4.

Note also that the connector uploads with `upsert` keyed on the row `id`, so
on this path the PowerSync row id is the idempotency key — not
`client_event_id`, which 0008 added for the localStorage queue and which is
deliberately not in the client schema. Step 4 has to pick one of the two and
say so.

Step 4 is intentionally sequenced after 1–3. Written now it would have to
straddle two runtimes — a no-PowerSync fallback and the real path — because
`usePowerSync()` throws without a provider. Once the instance exists it
collapses to a single path, and it's the one piece of this that's
security-critical enough not to write blind.

## Verification

`tsc --noEmit`, `next lint` and `next build` all clean with the provider
mounted. Bundle impact is negligible so far (`/` unchanged at 267 kB)
because the SDK is only pulled in once the env var is present.

**Nothing has been run against a live PowerSync instance** — there isn't one
yet. Everything here is unexercised except the SQL.

> **Updated 10 Aug 2026.** This previously read "or a live Postgres.
> Migration 0007 in particular … is unexecuted SQL." Both halves are now
> wrong: 0007 is applied, and so are 0008–0011. What remains unexercised is
> the client — the connector, the provider, the sync rules and the
> geofence trigger's behaviour under a real rejected punch.
