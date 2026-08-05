# 01 — Codebase comparison: attend-v1 vs attend-v2

The audit that preceded the merge. Both folders sat on the desktop as
independent builds of the same product. Neither was a git repository;
neither had `node_modules` installed.

## Raw shape

Excluding `node_modules`, `.next` and `.git`:

| | attend-v1 | attend-v2 |
|---|---|---|
| Files | 40 | 86 |
| `.tsx` | 20 | 53 |
| `.ts` | 8 | 16 |
| `.sql` | 1 | 6 |
| App code (excl. lockfile) | ~1,200 lines | ~4,300 lines |
| Lockfile | 2,128 lines | 7,383 lines |

v1 also carried two stray zero-byte files at its root, `cd` and `npm` —
shell mishaps (`npm run dev` typed as `npm > run dev`, or similar) that got
saved as empty files. Junk, not code.

## Stack divergence

| | attend-v1 | attend-v2 |
|---|---|---|
| Next.js | 14.2.35 | 15.5.22 (pinned deliberately) |
| React | 18.3.1 | 19.1.0 |
| Tailwind | 3.4.9, with `tailwind.config.ts` | 4, CSS-first, no config file |
| Components | none — raw `div`s | shadcn/ui, 13 Radix primitives, hand-built |
| `@supabase/ssr` | 0.5.1 | 0.12.4 |
| `@supabase/supabase-js` | 2.45.4 | 2.111.0 |
| Charts | recharts 2.12.7 | none |
| Fonts | Inter, via CSS `font-family` only | `@fontsource` self-hosted: Source Serif 4, IBM Plex Sans, IBM Plex Mono |
| Dark mode | none | `next-themes`, full token set |
| Icons | none | lucide-react |
| Lint | `next lint` (unconfigured) | eslint 9 + `eslint-config-next` |

The version gap matters more than it looks. **v1's Supabase server client
calls `cookies()` synchronously**:

```ts
// attend-v1/lib/supabase/server.ts
export function createClient() {
  const cookieStore = cookies();   // sync — throws on Next 15
```

v2's is `async` and awaits it. This single difference means no file in v1
that touches Supabase on the server could be copied into v2 without a
rewrite — which ruled out lifting its dashboards wholesale.

## Routing and feature surface

**attend-v1**

```
/                        landing page
/login                   admin sign-in (+ forgot password)
/dashboard               single role-router route
  ├─ super_admin  → SuperAdminDashboard  (all orgs)
  ├─ org_admin    → OrgAdminDashboard    (their org)
  ├─ manager      → ManagerDashboard     (their site)
  └─ staff        → static placeholder ("use the mobile app")
/auth/sign-out           POST route handler
```

One route, four renders. The idea is sound — a manager who types the
super-admin URL can't get anywhere, because there is no super-admin URL.

**attend-v2**

```
/                        landing page
/login                   sign-in + sign-up
/onboarding              self-serve org creation (Postgres RPC)
/dashboard               staff self-service: clock in/out, shifts,
                         attendance history, leave requests
/checkin                 shared kiosk / QR capture path
/admin                   overview
/admin/sites             list + add + delete
/admin/staff             roster + real Supabase Auth email invite + remove
/admin/schedule          next 14 days of shifts, add + delete
/admin/devices           biometric terminals, register + remove
/admin/reports           stub
/admin/settings          stub
```

## Where v1 genuinely won

1. **Marketing content depth.** `IndustryTabs` (5 industries, interactive),
   `FeatureClusters` (16 features in 4 groups), `FAQ` (7 questions),
   `TrustBar`, `FinalCTA`, and a 4-column `Footer`. v2's landing had 7 flat
   feature cards and a one-line footer.
2. **Charts.** `ChartCard.tsx` exported a recharts `TrendChartCard` and
   `BarChartCard`. v2 had no charts at all, and `/admin/reports` was a stub.
   Caveat: v1's charts were fed **zeroed placeholder series** —
   `Array.from({length: 14}).map(() => ({ value: 0 }))`. Visually done, not
   data-wired.
3. **Super-admin cross-org view.** `SuperAdminDashboard` listed every
   organization with per-org staff counts. v2's own README flagged this as
   unbuilt.
4. **Forgot-password flow.** `LoginForm` had a `resetPasswordForEmail`
   mode. v2's login had sign-in and sign-up only.
5. **A `notifications` table** — no equivalent anywhere in v2.
6. **Typed database access** — `types/database.ts`, hand-written, passed as
   the generic to `createServerClient<Database>`. v2's client is untyped.

## Where v2 won — which is most of the product

- Five working admin CRUD sections against real queries and mutations.
- **Staff invite via the Supabase Admin API** — `inviteUserByEmail` with a
  service-role client, then an `employees` upsert linking the account.
- **Geofenced clock in/out**: browser Geolocation, haversine distance, a
  localStorage offline queue that flushes on the `online` event, and — the
  part that actually matters — **server-side geofence re-validation on every
  submit**, so a spoofed client can't write an out-of-bounds check-in.
- Self-serve onboarding through an atomic RPC (`create_organization_for_self`)
  that bootstraps org + default site + the caller's employee row.
- Shifts/scheduling with manager-scoped RLS.
- Biometric device registry with per-device generated webhook secrets.
- A 281-line demo seeder that creates real `auth.users` via the Admin API.
- Route-guarding middleware over `/admin`, `/dashboard`, `/onboarding`.
- Seven server-action files. v1 had none.

## The verdict that shaped the merge

The going-in assumption was "one is stronger in frontend, the other has the
backend." The first half didn't hold up.

v2 was ahead on frontend *foundation* — design tokens, a component library,
typography, dark mode, and a documented brand system — and ahead on backend
by a wide margin. v1's frontend edge was **content and two specific
features**, not architecture.

That inverted the obvious plan. Rather than porting v2's backend into v1's
"better frontend", the merge ran the other way: v2 as the base, with v1's
five real wins rebuilt inside it.
