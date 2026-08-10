# Context & sessions

Working notes from the AttendPAC v1 → v2 merge, written so the reasoning
behind the current state of this repo survives past the session that
produced it. The root `README.md` tells you how to run the thing; these
files tell you why it looks the way it does.

Sessions: **6 August 2026** (docs 01–08) and **10 August 2026** — first the
v3 port (docs 09–10, plus corrections marked inline in 03, 04, 06, 07 and
08), then a security audit and hardening pass (doc 11, plus corrections in
01, 02, 06 and 07), then the platform console and rate limiting (doc 12).

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
| [11-security-hardening.md](11-security-hardening.md) | The CodeRabbit audit: how to run it on a whole codebase, the five criticals, the self-approved-leave hole it missed, and migration 0008 |
| [12-platform-console-and-limits.md](12-platform-console-and-limits.md) | `/super`, rate limiting (and why auth had to move server-side first), cookie/JWT policy, and the caching rule |
| [coderabbit-findings-10aug.md](coderabbit-findings-10aug.md) | Raw output — all 90 findings by severity |

## Where we left off — 10 Aug 2026 (hardening + platform console)

`tsc --noEmit`, `npm run lint` and `npm run build` all green (**19 routes**,
exit 0). On branch **`harden-security-audit`**, cut from `main` at
`9fa2a6f`. Not merged, not pushed.

> Note: the entry below previously said "committed, not pushed" of the v3
> hero work. `main` *is* pushed — `github.com/Gordian-Knotz/attend-gk`,
> 0 ahead / 0 behind. Corrected.

### What changed — part two: platform console ([12](12-platform-console-and-limits.md))

- **`/super`** — PAC's own operator console. Cross-org metrics (paying, on
  trial, genuinely active) plus writes for plan tier, billing status and
  suspension. Its own route segment, not part of `/admin`, so the
  one-org-at-a-time assumption every `/admin` page makes can't leak.
  `/admin/organizations` now redirects there.
- **Rate limiting** on auth, attendance and the contact form. In-memory,
  which is correct on one Railway container and **wrong past one replica** —
  swap `RateLimitStore` for Redis when you scale.
- **Auth moved to server actions.** It ran browser-side, so no limiter could
  see it. Side effects: no more account-existence oracle, and `/login`
  dropped 231 kB → 163 kB.
- **Cookie and JWT policy** in one place, PKCE everywhere. The dashboard
  settings that aren't code are tabulated in doc 12.
- **Caching**, with the rule that most of this data is RLS-scoped and must
  never enter a shared cache.
- **Migrations 0009** (contact_requests) **and 0010** (billing constraint,
  suspension, per-column update guard). Both unexecuted.

### What changed — part one: the audit ([11](11-security-hardening.md))

A full-codebase CodeRabbit review, then **88 of its 90 findings applied**,
plus one hole it missed. Raw findings in
[coderabbit-findings-10aug.md](coderabbit-findings-10aug.md).

The five things most worth knowing:

1. **`0008_attendance_insert_integrity.sql` is written.** It closes the
   0007 bypass and four more RLS holes. Re-runnable by design. **Still
   unexecuted.**
2. **Staff could approve their own leave** — CodeRabbit missed this one.
   `leave: self insert` checked only `employee_id`, and `status` had no
   constraint, so posting `status: 'approved'` moved you out of the absent
   count. A second fraud path that never touches the geofence.
3. **Any employee could read biometric webhook secrets**, which authenticate
   the geofence-exempt `biometric` source. Now admin-only, and the devices
   page no longer selects the column.
4. **Everything time-related ran on the server's timezone.** New
   `src/lib/timezone.ts` makes `Africa/Nairobi` (env-overridable) the single
   source for cutoffs, bucketing and display.
5. **Failed database queries rendered as confident empty states** — "No
   staff yet", all KPIs zero, and an exportable CSV of zeros.

### Blocked on you, in order

1. **Run migrations 0008, 0009 and 0010** (0008 with 0007 — 0007 alone does
   not enforce the geofence). Until then **leave
   `NEXT_PUBLIC_POWERSYNC_URL` unset**. These are the highest-risk
   unexecuted thing in the repo: an RLS policy that is too tight breaks the
   app at runtime, not at build. Read 0010 before running it — it rewrites
   existing `billing_status` values before adding its constraint.
2. **Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`.** Referenced in code,
   absent from the file. Blocks the `/admin/staff` invite and
   `scripts/seed-demo-data.mjs`.
3. **Work through [10](10-live-db-bringup.md)** — migrations 0005–0008 and
   seed against a real project, then the three computations most likely to
   be subtly wrong (day bucketing, check-in pairing, absent arithmetic).
   Add the 0008 cases from [11](11-security-hardening.md) to Phase 4.
4. **Browser-check this session's changes.** Nothing from either part has
   been looked at in a browser — including `/super`, which has never been
   rendered at all. Both previous sessions shipped green builds that a
   browser pass then found real defects in. Also worth exercising: that the
   auth rate limit actually trips, that a ~20-punch offline drain doesn't,
   and a suspend/restore round trip on a scratch org.
5. `npm install-scripts approve @journeyapps/wa-sqlite` — still blocked, and
   re-confirmed precisely on 10 Aug: `libpowersync.wasm` and
   `libpowersync-async.wasm` are genuinely absent from its `dist/`. It
   executes a package script and fetches a binary, which is why it hasn't
   been done unasked.
6. **Provision PowerSync** — Cloud instance, `supabase/powersync-setup.sql`
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

> **Scope note, security pass.** The above describes the *v3 hero* browser
> pass only. Nothing from the hardening session has been in a browser —
> see [11](11-security-hardening.md) → Verification.

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
`setup-admin.sql` now takes the bootstrap super-admin's address as a
variable you edit at the top; it used to hardcode a personal one.

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
