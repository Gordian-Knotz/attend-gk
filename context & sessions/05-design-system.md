# 05 — Design system

What the ported UI had to conform to, and the design calls made inside those
constraints.

## The constraint

v2's look isn't a style choice made in a vacuum — it comes from **DS-01, "The
PAC Document Format"**, a real internal spec. The brief was already pinned,
so the job was consistency, not reinvention. Every ported section had to
read as if it had always been part of this app.

DS-01's one rule: **every page is either paper or ink.** That maps directly
onto light/dark mode.

## Tokens

All in `src/app/globals.css`. Tailwind 4 CSS-first — there is no
`tailwind.config.ts`.

| Token | Hex | Role |
|---|---|---|
| `--pac-ink` | `#171210` | dark bg / light text |
| `--pac-graphite` | `#2a211d` | dark card surface |
| `--pac-orange` | `#e8532e` | primary: buttons, links, focus ring |
| `--pac-orange-light` | `#f4a98d` | light accent / tint |
| `--pac-ember` | `#a63a1c` | destructive; dark-mode accent |
| `--pac-paper` | `#f7f3ec` | light bg / dark text |

`secondary`, `muted` and `border` are derived shades — DS-01 is a print spec
and didn't need app-UI surface hierarchy.

`--radius: 0.2rem`. Nearly square. This is why v1's `rounded-pill` chips
couldn't come across as-is.

## Typography

| Face | Variable | Used for |
|---|---|---|
| Source Serif 4 | `--font-source-serif` | display, all headings |
| IBM Plex Sans | `--font-plex-sans` | body, UI |
| IBM Plex Mono | `--font-plex-mono` | labels, metadata, status |

Self-hosted via `@fontsource` — no Google Fonts CDN call.

`h1`–`h4` get `font-serif` and `letter-spacing: -0.01em` in a base layer, so
headings are serif by default.

The single most load-bearing utility:

```css
.font-label { @apply font-mono uppercase tracking-widest text-xs; }
```

It's on eyebrows, table metadata, stat-tile labels, sidebar section heads,
badges. Used correctly, a new section looks native immediately. Every ported
component uses it.

## Section conventions

Learned by reading the existing landing page, then applied to all five new
sections:

```tsx
<section id="…" className="mx-auto max-w-6xl px-6 py-16">
  <h2 className="font-serif text-3xl">
    Plain words <span className="italic text-primary">accent phrase</span>
  </h2>
  <p className="mt-4 max-w-lg text-muted-foreground">…</p>
  <Separator className="mt-4 mb-8" />
  …
</section>
```

The **italic-primary accent phrase** in every h2 is the page's signature
device. It's in the hero ("*See it live*"), "What's *included*", "How staff
*clock in*", "Who sees *what*". Every ported heading follows it:
"…manage *attendance*", "…how your industry *actually works*", "Got
questions? *We've got answers*".

Full-bleed emphasis sections drop the container and use
`bg-pac-ink text-pac-paper` — the DS-01 section-opener convention. The CTA
band and the new footer both use it.

## Component vocabulary

| Component | Notes |
|---|---|
| `Badge` | variants `default` (ink), `attention` (primary), `outline`, `proposed` (dashed), `destructive`. All `font-label`. |
| `Callout` | DS-01 §04's three escalating treatments: `note` (left rule + chip), `status` (label bar on tint), `critical` (ink panel). |
| `StatTiles` | `border-t-2 border-foreground`, serif 4xl values, mono labels, hairline dividers between. Optional `unit` renders in primary. |
| `Tabs` | Underline style — `border-b-2`, primary when active. No pill/background switcher. |
| `Separator` | The section-head rule. |

## Design calls made during the port

### Feature clusters as a document list, not cards

The page already had 3 capture-method cards. Adding 16 feature cards would
have made it a card catalogue. DS-01 is a *document* format, so the clusters
became hairline-ruled `<dl>`s with `border-t-2 border-foreground` heads —
which reads like a specification, and lets 16 items occupy the space 6 cards
would have.

### Trust bar as a masthead

v1 used `rounded-pill` chips on a tint. Against `--radius: 0.2rem` those
read as foreign. Rebuilt as centred serif names under a mono label, between
hairline rules.

### Charts inherit the theme through CSS variables

Recharts takes colour as SVG attributes, and SVG accepts `var()`:

```tsx
<Line stroke="var(--primary)" />
<CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
```

So the charts re-theme on the light/dark toggle with no JS theme detection
and no re-render. Axis ticks use `--font-plex-mono` at 11px via the shared
`AXIS_TICK` constant, matching every other number in the app.

The three series are distinguished by **weight and dash as well as hue** —
present is 2px solid primary, late is 2px solid in the lighter orange,
absent is 1.5px dashed muted. Orange-on-orange alone wouldn't separate for
anyone with reduced colour discrimination; the dash pattern carries it.

Recharts' default tooltip was replaced outright — it's a hard-coded white
box that's unreadable on ink.

### FAQ on native `<details>`

No accordion primitive existed, and adding `@radix-ui/react-accordion` for
seven questions wasn't worth it. Native `<details>` is keyboard-accessible
and works without JS. The `+` rotates 45° to an `×`, with
`motion-reduce:transition-none`.

### Empty states name the action

The Notices panel's empty state says *"Nothing posted yet. Use **Post
notice** to tell the team something."* — naming the control that fixes it,
in the same words the button uses. The charts say *"No attendance recorded in
this period yet"* rather than rendering empty axes.

### Button labels match their outcomes

"Start free" leads to account creation; "Post notice" produces a notice;
"Export CSV" flips to "Downloaded". The vocabulary stays constant through
each flow.

## Quality floor

- Responsive: every new grid collapses to single-column; the reports and
  organizations tables sit in `overflow-x-auto` so the page body never
  scrolls sideways.
- Focus: interactive elements keep visible focus. The `<summary>` and footer
  links carry explicit `focus-visible:ring-2`.
- Reduced motion: the only transitions are the FAQ chevron and colour
  changes; the chevron respects `motion-reduce`.
- Both themes: everything was built against the token set rather than
  literal hexes, so light and dark both work. The one place needing an
  explicit override is the outline button on the ink CTA band, where the
  default variant would be invisible.
