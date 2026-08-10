# 09 — The attend-v3 port: hero and bento

Session of **10 August 2026**. Two pieces were taken from a third codebase,
`attend-v3`, which appeared on the desktop after the v1→v2 merge closed.

## What attend-v3 actually is

Not a successor to v2. It's the **v1 lineage** with React Bits layered on:

| | attend-v3 |
|---|---|
| Next / React | 14.2.35 / 18.3.1 |
| Tailwind | 3.4.9, with `tailwind.config.ts` |
| Data model | `profiles`, `attendance_records` — v1's |
| Routes | `/`, `/login`, `/dashboard` (role-router), `/auth/sign-out` |
| Structure | `app/` + `components/` at root, no `src/` |
| React Bits | `Threads`, `MagicBento`, `CardSwap`, `LogoLoop` |
| New vs v1 | `@base-ui/react`, `components/auth/*` (SignInForm, ForgotPasswordForm, FeatureCarousel) |

It still carries the two zero-byte `cd` and `npm` junk files
[01](01-codebase-comparison.md) recorded in v1, and `lib/supabase/server.ts`
still calls `cookies()` synchronously. So the three incompatibilities from
[02](02-merge-decisions.md) all apply again — **nothing could be copied**,
only rebuilt. Same as last time.

Where v3 uses each component:

```
Hero            → Threads      (ogl line field)
FeatureClusters → MagicBento   (16 features as bento cards)
IndustryTabs    → CardSwap
TrustBar        → LogoLoop
```

## Decisions taken

Two calls, both made explicitly rather than inferred:

1. **The hero adopts v3's centred layout**, not just its backdrop.
2. **The bento goes to `/admin`, not the features section.** v2's
   `FeatureClusters` — the hairline-ruled `<dl>`s from
   [05](05-design-system.md) — stays exactly as it was.

The second is worth dwelling on, because [07](07-ui-motion-layer.md) records
`MagicBento` being *evaluated and rejected* for the marketing feature grid.
That judgment still holds for the landing page. Moving the device to the
admin overview is a different question with a different answer: a dashboard
of live panels is what a bento grid is actually for.

---

## The hero

### `src/components/reactbits/Threads.tsx` — vendored, unmodified

Copied verbatim from `attend-v3/components/Threads.tsx`, following the
convention in [07](07-ui-motion-layer.md): vendored files stay untouched so
re-pulling from the registry can't clobber local fixes, and
`eslint.config.mjs` already relaxes rules for `src/components/reactbits/**`.

This copy is a better one than the stock registry version — it already gates
the render loop on `IntersectionObserver` + `document.hidden`, caps internal
render resolution at 1920px on the longest side, and releases the WebGL
context on unmount. No changes needed.

`ogl` was already a dependency (Aurora used it), so **the dependency
footprint didn't grow.**

### `src/components/site/hero-threads.tsx` — new wrapper

Replaces `HeroBackdrop`. Same two hard-won constraints as Aurora, both from
07's browser pass:

- rendered on the **full-bleed wrapper**, not inside `max-w-6xl`, or the
  field ends in two vertical edges at the container bounds
- **radial** mask, not a bottom-only linear fade, which would leave crisp
  left and right edges

Differences from the Aurora wrapper:

- **Colour is a literal, not a token.** `color` is a shader `vec3` handed
  straight to WebGL, so it can't read `--pac-orange`. `#E8532E` is
  normalised to `[0.91, 0.325, 0.18]`. **This is the one place a DS-01
  token is duplicated as a number — if `--pac-orange` changes, change it
  here too.**
- **No per-theme palette needed.** The shader emits
  `vec4(uColor * colorVal, colorVal)` — line intensity *is* the alpha — so
  the field composites over paper or ink unchanged. Only opacity is themed
  (40% light / 60% dark). Threads reads better on paper than Aurora did,
  because lines stay legible where a wash turned into the "muddy salmon
  slab" 07 describes.
- **`enableMouseInteraction` is off, deliberately.** The wrapper is
  `pointer-events-none` so it can never intercept a hero CTA click — which
  also means the container would never receive `mousemove`, so the prop
  would be dead weight rather than a feature. v3 has it on because its
  backdrop does take pointer events.

### `src/app/page.tsx` — hero rewritten

From a two-column grid to a centred column, `max-w-3xl`, everything
`text-center`.

**Kept:** the `BlurLabel` eyebrow, the `RevealHeading` h1 with its
italic-primary accent ("*See it live*" — the page's signature device per
[05](05-design-system.md)), both CTAs, and `StatTiles` below the fold of the
hero. v2's own copy was kept over v3's headline, because the accent phrase
is load-bearing for the brand and v3's wording has nowhere to put it.

**Dropped from the page:** `HeroRotator` and `HeroPreview`. A centred
composition has no side column for a preview card, and the rotator competed
with the headline for the same vertical space.

**Now orphaned but left on disk** — no importers, easy to put back:

```
src/components/site/hero-backdrop.tsx   (Aurora wrapper)
src/components/site/hero-preview.tsx
src/components/site/hero-rotator.tsx
src/components/reactbits/Aurora.tsx     (only hero-backdrop imported it)
```

Reverting to the previous hero is: restore the three imports, swap
`<HeroThreads />` back to `<HeroBackdrop />`, and restore the two-column
grid. Nothing else references them.

---

## The bento

### Why `MagicBento` was not vendored

It's the one component in this port that got **rewritten rather than
wrapped**, and the reasons are the same ones 07 gave for rejecting it, now
compounded by what the admin page has to display:

| Problem | Detail |
|---|---|
| Text-only cards | `BentoCardProps` is `{color, title, description, label}`. There is no slot for a chart, a table, or a list. |
| Fixed geometry | `aspect-[4/3] min-h-[200px]`. A 14-day trend chart and a five-column table do not share one aspect ratio. |
| Dark-only | `--background-dark: #120F17`, `color: var(--white)`, `--purple-primary: rgba(132,0,255)`. Renders on ink, disappears on paper. |
| Wrong radius | `rounded-[20px]` against DS-01's `--radius: 0.2rem`. |
| 919 lines | Including a malformed nested CSS block at its lines 642–647 (`.card--border-glow::after { .card-responsive .card:nth-child(6) { … } }`) that does nothing. |

So the **effects** were ported and the **surface** is v2's.

### `src/components/motion/bento.tsx` — new

Two exports, mirroring MagicBento's own split between `GlobalSpotlight` and
`ParticleCard`:

**`BentoGrid`** — owns the proximity glow. On pointer move it walks its
`.bento-card` descendants and writes `--glow-x`, `--glow-y` and
`--glow-intensity` on each. Same banding maths as the original: full
intensity within `radius * 0.5`, linear ramp out to `radius * 0.75`.

Two changes from MagicBento:

- **Distance is measured to the card's edge, not its centre.** The original
  subtracts `max(width, height) / 2` and so do we — without it a large card
  (the chart, spanning three columns) would never light, because its centre
  is always far from the pointer even when the pointer is inside it.
- **Listeners are scoped to the grid, not `document`.** MagicBento binds
  `document.mousemove`. The admin `<main>` is its own scroll container and
  the grid fills it, so a document listener would fire constantly for no
  extra effect. `clientX/clientY` are viewport-relative, so the scroll
  container needs no special handling — the same trap 07 hit with GSAP
  ScrollTrigger doesn't apply here.

**`BentoCard`** — the surface plus the per-card effects. Its shell is
copied from `ui/card.tsx` verbatim
(`bg-card text-card-foreground border border-border rounded-sm flex flex-col gap-4 py-5`),
which is what lets every existing `CardHeader` / `CardContent` panel drop in
untouched — the same trick `ui/spotlight-card.tsx` already uses.

Particles, magnetism and click ripple are **opt-in props, defaulting off**:

| Effect | Applied to | Why not everywhere |
|---|---|---|
| Proximity border glow | every card | The signature behaviour; makes the grid read as one surface. |
| Particles | KPI tiles only | Twelve drifting dots over a line chart is noise on top of data. |
| Magnetism | KPI tiles only | It shifts the card under the cursor, which makes table rows harder to hit. |
| Click ripple | KPI tiles only | A pulse firing when you click a table row is meaningless feedback. |
| Tilt | nowhere | Rotating a card distorts a chart's axes. v3's own usage passed `enableTilt={false}`. |

The split is the point: decoration on the decorative tiles, restraint on the
cards carrying numbers someone will act on. All four are single props if you
disagree — see "Dialling it back".

`prefers-reduced-motion` short-circuits everything: `BentoGrid` binds no
listeners, `BentoCard` renders a plain card, and the glow ring is
`display: none`. None of the React Bits originals honour it.

### `src/app/globals.css` — border-glow CSS

The masked-ring trick (`mask-composite: exclude` over a 1px `padding`, so
`::after` paints only the border, not the face) is carried over. The colour
is not: it derives from `--primary` through `color-mix`, so the ring
re-themes with the light/dark toggle for free.

Ring is **1px** to match `border-border`. MagicBento uses 6px, which against
DS-01's hairlines reads as a neon outline rather than a lit edge.

### `src/app/admin/page.tsx` — laid out as a bento

```
lg (4 cols):
┌────────┬────────┬────────┬────────┐
│Present │ Late   │ Absent │On leave│   4 KPI cells, full effects
├────────┴────────┴────────┼────────┤
│ Attendance trend    (×3) │ Sites  │
├──────────────────────────┼────────┤
│ Today's exceptions  (×3) │Notices │
└──────────────────────────┴────────┘
```

Everything below `lg` goes full-width — the side panels take
`sm:col-span-2 lg:col-span-1` specifically so the `sm` two-column stage
doesn't leave a hole next to a half-width Sites card.

Substantive changes beyond layout:

- **`StatTiles` was replaced on this page only** by four KPI bento cells.
  They keep the DS-01 stat-tile typography (serif `text-4xl` value,
  `font-label` caption) and the `border-t-2 border-t-foreground` rule, so
  they still read as the same device. `StatValue`/`CountUp` is preserved, so
  the numbers still count up. `StatTiles` itself is untouched and still used
  by the landing page, `/admin/reports` and `/admin/organizations`.
- **A `KPI_TILES` constant** keys each label to its field on the `kpi`
  object, so a caption can't drift away from the number under it.
- **The exceptions table gained `overflow-x-auto`.** `BentoCard` is
  `overflow-hidden` — it has to be, for the particles and the glow ring — so
  a wide table would be *clipped* rather than allowed to spill. It now
  scrolls in its own box, consistent with the rule in
  [05](05-design-system.md) that the page body never scrolls sideways.

No query, no computation and no arithmetic changed. This is a presentation
change over the same data.

---

## Verification

```
tsc --noEmit  ✓ exit 0
npm run lint  ✓ exit 0
npm run build ✓ 18 routes, exit 0
Playwright     ✓ 1366×1000, 390×844, 320×844, both themes, 0 console errors
```

Route sizes after: `/` 30.9 kB (265 kB first load), `/admin` 8.04 kB
(303 kB). `/admin` grew because the overview now pulls in a client component
and gsap; it was a fully server-rendered page before.

## The browser pass

Driven with Playwright at **1366×1000, 390×844 and 320×844**, in both
themes. **Zero console errors or warnings** across the whole pass.

Because `/admin` sits behind auth and needs a live Supabase session, the
bento was checked through a temporary `/bento-check` route rendering the same
`BentoGrid` / `BentoCard` composition with fixture data — same components,
same spans, same effect props, no database. **That route was deleted
afterwards**; if you want it back, it was a static copy of the admin grid.

### Confirmed working

| Check | Result |
|---|---|
| Threads full-bleed | Backdrop `x=0, width=1351` against `clientWidth` 1351 — exact. No hard edges. This is the defect Aurora shipped with; it did not recur. |
| Horizontal overflow | `scrollWidth <= clientWidth` at 1366, 390 and 320. (Note: compare against `clientWidth`, not `innerWidth` — the latter includes the 15px scrollbar, so 07's `scrollWidth === innerWidth` formulation reads as a false failure.) |
| `color-mix` + `calc()` in a gradient | Resolves. Computed `::after` background is `color(srgb 0.909804 0.32549 0.180392 / 0.75)` — the DS-01 orange at the expected alpha. `mask-composite: exclude` applies. |
| Proximity glow maths | Hovering KPI 1: itself `1`, neighbour `0.944`, far cells `0`. |
| **Edge-distance measurement** | The 3-column chart card read `1` while distant small cards read `0` — i.e. the change from centre-distance to edge-distance is doing exactly the job it was written for. A centre-based measure would have left the largest card dark. |
| Particles | 10 spawned on hover, cleaned up on leave. |
| Magnetism | Identity transform on a centre hover, which is correct — the offset is computed from pointer-to-centre, so dead centre is zero displacement. |
| Bento at mobile | All 8 cells full-width (327px at 390 viewport), no page overflow. |
| Both themes | Ring, particles and card surfaces read correctly on paper and ink. |

### Two defects found and fixed

**1. The italic accent phrase broke across the line.** The headline rendered
as "…from the field. *See*" / "*it live* from the office." — splitting the
accent that [05](05-design-system.md) calls the page's signature device into
two fragments. It's a consequence of the centred layout: narrower measure,
different break point than the old two-column hero.

Fixed with `whitespace-nowrap` on the accent span. The break now falls at
the sentence boundary ("Clock in from the field." / "*See it live* from the
office."), which reads better than the original. Verified safe at 320px —
the phrase is 190px inside a 257px `h1`, one line box, no overflow.

**2. Threads was too strong on paper.** At 40% the line field drifts across
the hero paragraph at roughly the vertical middle, and on paper that sits
behind `text-muted-foreground` — already the lowest-contrast text on the
page. Reduced to **25% light**, dark left at 60%. The 40% figure was a guess
reasoned across from Aurora, and this is the second time an inherited
opacity has needed lowering on paper specifically; the pattern is worth
remembering.

### One thing I got wrong

I first read the chart's last x-axis label as clipped by `BentoCard`'s
`overflow-hidden`. It isn't — measured, the furthest label ends at 937
against a 954 inner edge, and no label overflows. Recharts had simply
thinned "13 Aug" to avoid collision, which it does at any width. Worth
recording because "the bento clips its content" is a plausible-sounding
failure that would have sent the next person looking in the wrong place.

### Still open

- **`/admin` itself has never been rendered.** The bento was verified
  through a fixture route with the same components; the real page adds live
  data, `PostNoticeDialog`, `DismissNoticeButton`, and the `Reveal` wrapper
  in the admin layout. Needs a session — see [10](10-live-db-bringup.md).
- **Site names truncate in the narrower column.** "Mombasa Road Yard"
  exceeds its 130px measure by 1px and so takes an ellipsis. Marginal, but
  it's a consequence of Sites moving from a `1fr` half to a 1-of-4 column.
  Widen the cell, shorten the label, or accept it.
- **Every other route behind auth** — `/dashboard`, `/checkin`,
  `/onboarding` — remains unreviewed, as before.

## Dialling it back

Each layer detaches independently, in the same spirit as 07's list:

- **Threads only** — swap `<HeroThreads />` for `<HeroBackdrop />` in
  `src/app/page.tsx`. Aurora is still on disk. `ogl` is needed either way.
- **The centred hero** — restore the `lg:grid-cols-[1.1fr_1fr]` grid and the
  `HeroRotator` / `HeroPreview` imports; both files are still there.
- **Bento effects, keeping the layout** — drop the `particles`, `magnetism`
  and `ripple` props from the four KPI cells. The grid keeps its glow.
- **The glow too** — delete the `.bento-card` blocks from `globals.css`. The
  JS keeps setting custom properties nothing reads; harmless.
- **The whole bento** — `BentoGrid` → `div className="grid gap-4 …"`,
  `BentoCard` → `Card`. The shells are identical, so no inner markup
  changes. Then restore `StatTiles` for the four KPIs.
