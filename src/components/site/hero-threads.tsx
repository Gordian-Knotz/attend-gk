"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

import Threads from "@/components/reactbits/Threads";
import { isSoftwareWebGL } from "@/lib/webgl-support";

/**
 * Animated line field behind the hero, ported from attend-v3.
 *
 * Replaces `HeroBackdrop` (Aurora). Where Aurora is a colour wash, Threads
 * is a field of drifting Perlin-displaced lines — it reads as structure
 * rather than atmosphere, which suits a document format better and stays
 * legible on paper instead of turning into a salmon slab.
 *
 * `color` is the DS-01 orange (`--pac-orange`, #E8532E) normalised to 0–1
 * for the shader. It can't read the CSS variable — the uniform is a vec3
 * handed straight to WebGL — so this is the one place a token is duplicated
 * as a literal. If `--pac-orange` changes, change it here too.
 *
 * The shader outputs `vec4(uColor * colorVal, colorVal)`, i.e. line
 * intensity *is* the alpha, so the field composites over whatever is behind
 * it and needs no per-theme palette — only a per-theme opacity.
 *
 * Those opacities are 25% light / 60% dark, and the asymmetry is deliberate.
 * Looked at in a browser, the lines drift across the hero at roughly the
 * vertical middle — which on paper is behind `text-muted-foreground`, already
 * the lowest-contrast text on the page. 40% (the first guess, reasoned across
 * from Aurora) measurably muddied the body copy. On ink the same field reads
 * as texture and can carry more.
 *
 * Two constraints carried over from Aurora, both learned the hard way (see
 * 07-ui-motion-layer.md):
 *
 *  - It must be rendered OUTSIDE the hero's `max-w-6xl` container, or
 *    `inset-0` resolves to 1152px and the field ends in two hard vertical
 *    edges against the page.
 *  - The mask is radial. A bottom-only linear fade still leaves crisp left
 *    and right edges once the element is full width.
 *
 * `enableMouseInteraction` is deliberately off. The wrapper is
 * `pointer-events-none` so it can never intercept a click on the hero CTAs
 * sitting above it — which also means the container would never receive
 * mousemove, so the prop would be dead weight rather than a feature.
 *
 * Skipped entirely under `prefers-reduced-motion`, and mounted only after
 * hydration so the WebGL context never blocks first paint.
 *
 * Also skipped when WebGL is rendering in software, which is a far bigger deal
 * than it sounds: on the same build and URL, Lighthouse desktop scored 92 with
 * a hardware GPU and 57 without, with total blocking time going from 180 ms to
 * 35,970 ms. Anyone on a blocklisted GPU — and PageSpeed Insights itself, which
 * has no GPU — was getting a page frozen for over half a minute for the sake of
 * a background texture. See `isSoftwareWebGL` for how it is detected and why the
 * unknown case is treated as hardware.
 *
 * The probe runs in the same effect as `mounted` rather than during render:
 * touching `document` while rendering is what produced five React #418
 * hydration mismatches in this codebase (doc 13), and this file's own
 * `mounted` gate exists because of them.
 */
export function HeroThreads() {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  const [softwareGL, setSoftwareGL] = React.useState(false);

  React.useEffect(() => {
    setSoftwareGL(isSoftwareWebGL());
    setMounted(true);
  }, []);

  if (!mounted || reduceMotion || softwareGL) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 opacity-25 [mask-image:radial-gradient(120%_90%_at_50%_25%,black_35%,transparent_80%)] dark:opacity-60"
    >
      <Threads
        color={[0.91, 0.325, 0.18]}
        amplitude={1.1}
        distance={0.25}
        enableMouseInteraction={false}
      />
    </div>
  );
}
