# Context & sessions

Working notes from the AttendPAC v1 → v2 merge, written so the reasoning
behind the current state of this repo survives past the session that
produced it. The root `README.md` tells you how to run the thing; these
files tell you why it looks the way it does.

Sessions: **6 August 2026** (docs 01–08) and **10 August 2026** (docs 09–10,
plus corrections marked inline in 03, 04, 06, 07 and 08).

| File | What's in it |
|---|---|
| [01-codebase-comparison.md](01-codebase-comparison.md) | The full v1 vs v2 audit: file counts, stack, routing, schema, and where each version genuinely won |
| [02-merge-decisions.md](02-merge-decisions.md) | Which direction the merge ran, what was ported, what was discarded, and the reasoning for each call |
| [03-what-was-built.md](03-what-was-built.md) | File-by-file breakdown of everything added or changed, with the non-obvious implementation details |
| [04-database-and-rls.md](04-database-and-rls.md) | Schema divergence, the RLS bugs found in both codebases, the new migrations — **and the 0007 geofence bypass found 10 Aug** |
| [05-design-system.md](05-design-system.md) | DS-01 tokens, the component conventions the ported UI had to match, and the design calls made along the way |
| [06-next-steps.md](06-next-steps.md) | Known gaps, caveats worth knowing before trusting a number on screen, and what to pick up next |
| [07-ui-motion-layer.md](07-ui-motion-layer.md) | React Bits: how it's installed (the CLI is broken here), what's vendored, every wrapper and why, and how to dial it back |
| [08-powersync-offline.md](08-powersync-offline.md) | Offline sync: scope, the geofence hole PowerSync's write path opened, and what's left to go live |
| [09-v3-hero-and-bento.md](09-v3-hero-and-bento.md) | What attend-v3 is, the centred Threads hero, and the bento rewrite on `/admin` — with the browser checks still owed |
| [10-live-db-bringup.md](10-live-db-bringup.md) | The ordered plan for running 0005–0008 against a real Postgres, with fixtures and expected values for every check |

## Where we left off — 10 Aug 2026

`tsc --noEmit`, `npm run lint` and `npm run build` all green (18 routes,
exit 0), and the new UI has been driven in a browser in both themes at three
widths. Committed, not pushed.

### What changed this session

1. **Verified the 6 Aug notes against the repo.** Four corrections, all
   marked inline in the affected docs. The load-bearing one: `.env.local`
   *does* exist, so the reason given for "nothing has run against live
   Supabase" was wrong even though the conclusion held.
2. **Found a real security bug**: migration 0007's geofence trigger is
   bypassable from a client, because 0001's insert policy constrains only
   `employee_id`. Details and fix in [04](04-database-and-rls.md).
3. **Ported the hero and a bento layer from `attend-v3`**, then drove both in
   a browser and fixed the two defects that turned up — see
   [09](09-v3-hero-and-bento.md).
4. **Fixed `npm run lint`**, which was reporting ~1,450 problems in the
   generated `public/@powersync/` bundles. `eslint.config.mjs` now ignores
   them; `next lint` used to skip `public/` implicitly and the bare CLI
   doesn't.

### Blocked on you, in order

1. **Write and run `0008_attendance_insert_integrity.sql`** before anything
   else touching attendance. Until it exists the geofence is not enforced,
   so **leave `NEXT_PUBLIC_POWERSYNC_URL` unset** —
   [04](04-database-and-rls.md) has the sketch.
2. **Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`.** Referenced in code,
   absent from the file. Blocks the `/admin/staff` invite and
   `scripts/seed-demo-data.mjs`.
3. **Work through [10](10-live-db-bringup.md)** — migrations 0005–0008 and
   seed against a real project, then the three computations most likely to
   be subtly wrong (day bucketing, check-in pairing, absent arithmetic).
4. `npm install-scripts approve @journeyapps/wa-sqlite` — still blocked, and
   re-confirmed precisely on 10 Aug: `libpowersync.wasm` and
   `libpowersync-async.wasm` are genuinely absent from its `dist/`. It
   executes a package script and fetches a binary, which is why it hasn't
   been done unasked.
5. **Provision PowerSync** — Cloud instance, `supabase/powersync-setup.sql`
   on a **direct** Postgres connection (DDL and `CREATE ROLE` can't go
   through PostgREST), deploy `powersync/sync-rules.yaml`, then the env var
   from item 1's caveat.

**First job after those:** rewrite `src/app/dashboard/checkin-widget.tsx`
and `/checkin` onto local SQLite, dropping the localStorage queue. Held back
deliberately — see the end of [08](08-powersync-offline.md).

### The browser pass was done

Playwright at 1366×1000, 390×844 and 320×844, both themes, **zero console
errors**. Full results in [09](09-v3-hero-and-bento.md).

Confirmed: Threads is exactly full-bleed with no hard edges (the Aurora
defect did not recur); `color-mix` + `calc()` resolves so the glow ring
really paints; the proximity maths works, including the edge-distance change
that keeps the large chart card lit; mobile stacks cleanly.

**Two defects found and fixed:** the italic accent phrase was breaking across
the line (now `whitespace-nowrap`, break falls at the sentence boundary), and
Threads at 40% muddied the hero paragraph on paper (now 25% light / 60%
dark).

Mobile widths are no longer unreviewed — the landing page and the bento were
both checked at 390 and 320.

**Still unreviewed:** `/admin` as the real page rather than a fixture copy,
plus `/dashboard`, `/checkin` and `/onboarding`. All need an authenticated
session, so they depend on item 3 above.

### Open decisions

**`RevealHeading` renders `opacity: 0` into the SSR HTML**, so section
headings stay invisible if JS never runs. Inherent to scroll-triggered
reveals. Accept it, reveal on mount rather than on scroll, or drop `initial`
and animate from a CSS-visible state.

**`hero-threads.tsx` duplicates `--pac-orange` as a literal**
(`[0.91, 0.325, 0.18]`) because a WebGL uniform can't read a CSS variable.
If the token changes, that number has to change with it. No good way around
it; worth knowing it's there.

**Four orphaned files** left on disk so the previous hero can be restored:
`hero-backdrop.tsx`, `hero-preview.tsx`, `hero-rotator.tsx`,
`reactbits/Aurora.tsx`. Delete them once the new hero has been seen and kept.

### Also open, carried over

Generate database types (`supabase gen types`) — the Supabase client is
still untyped. The stray `C:\Users\PAC\package-lock.json` that makes every
build warn about workspace root. `next lint` is deprecated in Next 16 (the
`lint` script already calls `eslint` directly, so this is mostly done).
`setup-admin.sql` is hardcoded to `imranissa0@gmail.com`.

## The short version

Two independent builds of the same product existed: `attend-v1` and
`attend-v2`, both Next.js + Supabase, neither under version control.

The working assumption going in was "v1 is stronger on frontend, v2 has the
backend." The audit didn't support that. **v2 was ahead on both** — it has a
real design system, a component library, and roughly 4,300 lines of working
app code against v1's 1,200. v1's genuine advantages were narrower and
specific: more marketing copy, working charts, a cross-org admin view, and
password reset.

So: **v2 became the base, and v1's real wins were rebuilt inside it.** No v1
code was copied verbatim — its Supabase clients don't run on Next 15, and
its data model is incompatible with v2's. See
[02-merge-decisions.md](02-merge-decisions.md) for the full rationale.

`attend-v1` was left untouched on disk as a reference copy. Nothing in this
repo depends on it.

## A note on this folder's name

The `&` in "context & sessions" needs quoting in most shells:

```bash
cd "context & sessions"
```

Renaming it to `context-and-sessions` would remove that friction if it
becomes annoying.
