# 07 — React Bits & the motion layer

Added after the merge, in the same session. Covers how React Bits is wired
in, what was adapted and why, and where the animation is applied.

## How React Bits is installed

React Bits is a **copy-in registry**, not a package dependency — the same
model as shadcn/ui. Components are vendored into the repo and become yours
to edit.

It exposes a shadcn-compatible registry, so `components.json` gained:

```json
"registries": {
  "@react-bits": "https://reactbits.dev/r/{name}.json"
}
```

### The CLI doesn't work here

`npx shadcn@latest add @react-bits/<Name>-TS-TW` resolves the registry
fine, then dies installing peer deps:

```
Command failed: npm install -- "motion@^12.23.12" "gsap@^3.13.0"
npm error code EALLOWSCRIPTS
npm error --allow-scripts is not allowed in project-scoped installs.
```

This is an npm-policy vs shadcn-CLI incompatibility, not a React Bits
problem, and it reproduces on shadcn 4.16.1 and 4.15.0. Installing the deps
first doesn't help — shadcn re-runs the install unconditionally.

**Working method** — install deps yourself, then write the files from the
registry JSON (which is all the CLI does anyway):

```bash
npm install motion gsap ogl
```

```js
// node -e '...'
const res  = await fetch(`https://reactbits.dev/r/${name}-TS-TW.json`);
const item = await res.json();
for (const f of item.files) {
  fs.writeFileSync(
    path.join("src/components/reactbits", path.basename(f.path)),
    f.content, "utf8"
  );
}
```

Registry facts worth keeping: 165 components in the TS-TW variant; four
variants per component (JS-CSS, JS-TW, TS-CSS, TS-TW); the full item list is
at `https://reactbits.dev/r/registry.json`.

Note also that `ui.shadcn.com` **is** reachable from this machine — the root
README's claim that it wasn't refers to the original build sandbox, not
here. Normal shadcn components can be added with the CLI; only the peer-dep
step is broken.

## Dependency footprint

You only pay for what you vendor. Across all 165 components:

| Dep | Components needing it |
|---|---|
| `ogl` | 45 |
| `gsap` | 36 |
| `three` | 22 |
| `motion` | 20 |
| `@react-three/fiber` | 7 |
| everything else | ≤4 each |

This project installs **`motion`, `gsap` and `ogl`** only. The `three` /
`@react-three/*` family is avoided — those components cost ~600 kB.

## What's vendored

`src/components/reactbits/` — verbatim, unmodified:

| Component | Dep | Used by |
|---|---|---|
| `CountUp` | motion | `StatValue` → all stat tiles |
| `AnimatedContent` | gsap | `Reveal` → everywhere |
| `BlurText` | motion | `BlurLabel` → mono eyebrows |
| `Aurora` | ogl | `HeroBackdrop` |
| `SpotlightCard` | — | superseded, see below |

`LogoLoop` was pulled and then removed — a marquee of five text names reads
sparse, and it was the only file producing lint errors.

**These files are kept unmodified on purpose**, so re-pulling a component
doesn't clobber local fixes. `eslint.config.mjs` therefore relaxes three
rules for `src/components/reactbits/**` (`no-explicit-any`,
`exhaustive-deps`, `prefer-const`). Anything adapted for the brand gets
copied out into `src/components/ui` or `src/components/motion` and is linted
normally.

## The wrappers, and why each exists

React Bits components ship with two gaps: **none respect
`prefers-reduced-motion`**, and several hardcode a dark, large-radius look
that predates any design system. Every one is used through a wrapper.

### `src/components/motion/reveal.tsx`

Wraps `AnimatedContent`. Adds reduced-motion bail-out and pins defaults
(24px, 0.6s, `power3.out`, 0.15 threshold) so a page of reveals reads as one
system rather than a pile of separate effects.

### `src/components/motion/reveal-heading.tsx`

**Does not use BlurText or SplitText.** Both take a plain string and split it
into per-word spans — which would destroy the
`<span className="italic text-primary">` accent that every heading on this
site is built around, and that accent is the page's signature device. This
animates the heading as one block from `blur(10px)` + 14px to crisp,
preserving children exactly. Same visual read, no cost to the brand.

### `src/components/motion/blur-label.tsx`

Wraps `BlurText`, used **only** for the mono eyebrows — short plain strings
with no inline markup, where per-word splitting is safe.

### `src/components/site/stat-value.tsx`

Wraps `CountUp`. Only animates values matching `/^-?\d+(\.\d+)?$/` — tiles
also carry `"24/7"`, which would either fail the parse or count up
nonsensically. Keeps `StatTiles` a server component by isolating the client
boundary to the value itself.

### `src/components/site/hero-backdrop.tsx`

Wraps `Aurora`. Stock palette is purple/green; this feeds the DS-01 ramp
(`#A63A1C → #E8532E → #F4A98D`) so the motion stays recognisably PAC.
Amplitude lowered to 0.85, masked to a bottom fade, 45% opacity (60% dark),
so the hero type stays the loudest thing on the page. Mounts only after
hydration so the WebGL context never blocks first paint, and returns `null`
entirely under reduced motion.

### `src/components/ui/spotlight-card.tsx`

A **rewrite**, not a wrapper. The vendored `SpotlightCard` hardcodes
`rounded-3xl border-neutral-800 bg-neutral-900 p-8` and a white spotlight —
a dark-only card with a 24px radius, in a system whose radius is `0.2rem`
and which must work on paper as well as ink. This keeps the pointer-tracking
behaviour and rebuilds the surface to mirror `ui/card.tsx`'s shell exactly
(`bg-card border-border rounded-sm flex flex-col gap-4 py-5`), so
`CardHeader` / `CardContent` lay out identically inside either. Spotlight is
`color-mix(in srgb, var(--primary) 22%, transparent)`.

## Where it's applied

Chosen intensity: **expressive**. Scope: **everywhere**.

| Surface | Treatment |
|---|---|
| Hero | Aurora backdrop, `BlurLabel` eyebrow, `RevealHeading` h1 |
| Trust bar | `Reveal` |
| Feature clusters | `RevealHeading` + staggered `Reveal` per cluster |
| Capture cards | `SpotlightCard` + staggered `Reveal` |
| Industry tabs | `RevealHeading` |
| Access table | `RevealHeading` + `Reveal` |
| FAQ | `RevealHeading` + `Reveal` |
| CTA band | `BlurLabel` + `RevealHeading` |
| Contact | `BlurLabel` + `RevealHeading` |
| Stat tiles | `CountUp` — landing, `/admin`, reports, organizations |
| `/admin/*` | one `Reveal` in the layout (see below) |
| `/dashboard` | `Reveal` around the card stack |
| `/login`, `/reset-password` | `Reveal` on the card |

### Why admin gets one reveal, not per-card

The admin `<main>` is `overflow-y-auto` — its own scroll container. GSAP
ScrollTrigger instances inside it would measure against the window, so a
card below the container's fold could sit stuck at `opacity: 0`. Wrapping
once at the layout level sidesteps it: that wrapper is in view at mount, so
it animates on every navigation with no scroll dependency.

If per-card reveals are ever wanted in admin, `AnimatedContent` takes a
`container` prop — pass the scrolling `<main>`.

## Verification

```
tsc --noEmit  ✓
next lint     ✓ no warnings or errors
next build    ✓
```

**Not verified visually.** No browser was driven during this session, so the
Aurora backdrop's density, the spotlight's intensity, and the reveal timing
are unreviewed. Those are exactly the values most likely to need a nudge —
all are single constants in the files listed above.

## Dialling it back

Each layer detaches independently:

- **Backdrop only** — delete `<HeroBackdrop />` from `src/app/page.tsx`,
  then `npm uninstall ogl` and remove `reactbits/Aurora.tsx`.
- **All scroll reveals** — make `Reveal` return `<div className={className}>
  {children}</div>` unconditionally. One edit, applies everywhere.
- **Admin only** — remove the `Reveal` from `src/app/admin/layout.tsx`.
- **Everything** — the wrappers are the only consumers of
  `src/components/reactbits/`, so removing them frees the whole folder plus
  `motion`, `gsap` and `ogl`.
