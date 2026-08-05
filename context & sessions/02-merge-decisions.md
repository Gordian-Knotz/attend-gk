# 02 — Merge decisions

Every non-obvious call made during the merge, and why.

## Direction: v2 is the base, code moves one way only

v2 was ahead on both axes (see [01](01-codebase-comparison.md)), so it
became the trunk. v1's wins were **rebuilt** in v2, not copied.

Three hard reasons nothing could be copied verbatim:

1. **Runtime incompatibility.** v1's `lib/supabase/server.ts` calls
   `cookies()` synchronously. On Next 15 that throws. Every v1 server
   component that touches Supabase — all three dashboards, the dashboard
   router — inherits the problem.
2. **Data model incompatibility.** v1 reads `profiles` and
   `attendance_records`; v2 has `employees` and `attendance_events`. Not a
   rename — a different shape (see [04](04-database-and-rls.md)).
3. **Design system incompatibility.** v1's markup is built on Tailwind 3
   utilities that don't exist in v2: `brand-orange`, `neutral-gray4`,
   `rounded-pill`, `text-brand-darkGray`, plus hand-rolled `.card` /
   `.btn-primary` classes from its `globals.css`. Pasting v1 JSX into v2
   renders unstyled.

## Baseline safety

Neither project was under version control. Before touching anything:

```bash
git init && git add -A && git commit -m "Baseline: attend-v2 before v1 merge"
```

`attend-v1` was left untouched on disk as a reference copy. Nothing in this
repo reads from it.

## What was ported, and how

| From v1 | Decision |
|---|---|
| Marketing copy and IA | **Kept the words, rebuilt the markup.** All 16 features, 5 industries, 7 FAQs and the client list carried over verbatim as content; every element re-expressed in shadcn + DS-01. |
| Recharts charts | **Re-implemented, then actually wired to data.** v1's rendered zeros; these query real `attendance_events`. |
| Super-admin org list | **Rebuilt as `/admin/organizations`**, gated to `super_admin`, with plan tier and billing status that v1's schema didn't have. |
| Forgot password | **Rebuilt across two routes** — a third mode on `/login` plus a `/reset-password` landing page, which v1 lacked entirely. |
| `notifications` table | **New migration in v2's idiom** — `employees`-based RLS, plus a severity level and a posting UI v1 never had. |
| Typed DB access | **Not ported.** v1's `types/database.ts` describes v1's schema. The right move is `supabase gen types` against this schema — noted as open work, not done. |

## What was deliberately discarded

- **`attend-v1/supabase/schema.sql`** — superseded, and carries a
  cross-tenant write hole (see [04](04-database-and-rls.md)).
- **`attend-v1/lib/supabase/*`** — sync `cookies()`, won't run.
- **`attend-v1/types/database.ts`** — describes the wrong schema.
- **`attend-v1/tailwind.config.ts`** and the `.card` / `.btn-primary` CSS —
  Tailwind 3 idiom; v2 is CSS-first Tailwind 4.
- **The three v1 dashboard shells** — `OrgAdminDashboard`,
  `ManagerDashboard`, `SuperAdminDashboard`. v2's `/admin` already does more
  than all three combined, with real mutations.
- **v1's `Sidebar`, `KPICard`, `ListPanel`** — v2 has `AdminSidebar`,
  `StatTiles` and card primitives that cover the same ground.
- **The stray `cd` and `npm` zero-byte files.**

## Judgment calls worth flagging

### The landing page's flat feature grid was replaced, not supplemented

v2 had 7 feature cards; v1 had 16 features in 4 clusters. Keeping both would
have meant 23 feature entries on one page. The clusters supersede the flat
list — they're a superset, better organised.

### Feature clusters render as a document list, not cards

Sixteen more cards on a page that already has three capture-method cards
reads as filler. The clusters use hairline-ruled definition lists instead —
which also suits DS-01, a *document* format. This is the one place the
ported design deviates structurally from v1's original.

### v1's dead links were not carried over

v1's footer linked to a Help Center, a blog, API documentation and social
profiles — none of which exist — and its `IndustryTabs` had a
`<a href="#">See X features →`. Shipping dead links is worse than shipping
fewer links. The new footer has three columns where every href resolves.

To keep the Industries column meaningful rather than five links to the same
anchor, `IndustryTabs` became hash-controlled: `/#logistics` selects that
tab, because each `TabsTrigger` carries its industry id as an element id and
a `hashchange` listener syncs the active tab.

### v1's newsletter signup was dropped

The form had no backend and no handler. A subscribe box that silently does
nothing is a worse outcome than not having one. The footer points at the
existing `#contact` form instead, which does work.

### v1's grey "screenshot placeholder" boxes were not reproduced

Both `Hero` and `IndustryTabs` in v1 reserved grey boxes reading "Product
screenshot: manager dashboard" for images that were never produced. v2's
hero already has a real `HeroPreview` component. For the industry tabs, an
empty frame was replaced with a per-industry spec sheet (primary capture
method, typical site, common exception) — real information in the space an
absent image would have occupied.

### Notifications got a writer

v1's `notifications` was read-only with nothing writing to it — permanently
empty in any real deployment. Since the RLS had to be written anyway, a
"Post notice" dialog and a dismiss action came with it, so the feature does
something. Managers are restricted to their own site, both in the action and
in the policy.

### The 9 AM absent cutoff was preserved in the new chart

`/admin` already suppressed "absent" counts before 9 AM to avoid a phantom
morning spike. The trend chart's day-bucketing had to respect the same rule,
or today's bar would show the entire roster as absent every morning. That
logic lives in `buildDailySeries`'s `settled` check.

### One 14-day query now serves both the KPIs and the chart

The overview previously queried today's events. Rather than adding a second
query for the trend window, the existing query widened to 14 days and
today's numbers are filtered out of the same result set in memory.

## An RLS gap the port exposed

Building `/admin/organizations` surfaced a real bug. Migration 0003 gave
`super_admin` cross-org access on the sites *manage* policy but left
`"sites: select in org"` from 0001 org-scoped — so a super_admin could write
rows on another org's sites but not read them. Migration 0005 fixes it. This
wasn't a port; it was found by trying to use the feature.
