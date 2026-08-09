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
| `attendance_events` | their own punches (insert-only) |

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

**The database is a module singleton**, so React Strict Mode's double
invoke in development doesn't open two SQLite connections to one file.

## What's left

1. **Approve the blocked postinstall.** npm blocked
   `@journeyapps/wa-sqlite`'s `powersync-core:download`, so the PowerSync
   SQLite core extension is absent. Needs
   `npm install-scripts approve @journeyapps/wa-sqlite`. Left undone
   deliberately: it executes a package script and downloads a binary, which
   is the owner's call.

   **Re-confirmed 10 Aug 2026, precisely this time.** The check to run is
   *not* "is `dist/` empty" — it isn't, and that's misleading. `dist/` ships
   16 `.wasm`/`.mjs` artifacts in the npm tarball, including the
   `mc-wa-sqlite*` multi-cipher builds. What the blocked script fetches is
   named in `scripts/download-dynamic-core.js`:

   ```js
   const RELEASE_FILES = ['libpowersync.wasm', 'libpowersync-async.wasm'];
   const DIST_DIR = path.resolve(__dirname, '../dist');
   ```

   Neither `libpowersync.wasm` nor `libpowersync-async.wasm` is present.
   `powersync-version` pins the wanted core at **v0.5.2**. The dynamic
   builds require these files at runtime, so this fails when the DB opens,
   not at build time — which is why every build has been green regardless.

   Verify with:

   ```bash
   ls node_modules/@journeyapps/wa-sqlite/dist/libpowersync*
   ```
2. **Provision.** PowerSync Cloud instance; run
   `supabase/powersync-setup.sql` on a direct Postgres connection (not
   PostgREST — the keys in `.env.local` can't do DDL or role creation);
   connect the instance with "Use Supabase Auth"; deploy the sync rules;
   put the instance URL in `.env.local`.
3. **Run migration 0007 — and 0008 with it.** 0007 alone leaves the
   geofence bypassable (see the note above); the two belong together, since
   turning sync on is what makes the bypass the normal write path. Order and
   test cases in [10](10-live-db-bringup.md).
4. **Rewrite the check-in flow** to read and write local SQLite —
   `checkin-widget.tsx` and `/checkin`, replacing the localStorage queue.

Step 4 is intentionally sequenced after 1–3. Written now it would have to
straddle two runtimes — a no-PowerSync fallback and the real path — because
`usePowerSync()` throws without a provider. Once the instance exists it
collapses to a single path, and it's the one piece of this that's
security-critical enough not to write blind.

## Verification

`tsc --noEmit`, `next lint` and `next build` all clean with the provider
mounted. Bundle impact is negligible so far (`/` unchanged at 267 kB)
because the SDK is only pulled in once the env var is present.

**Nothing has been run against a live PowerSync instance or a live
Postgres.** Migration 0007 in particular — the haversine function and the
trigger — is unexecuted SQL.
