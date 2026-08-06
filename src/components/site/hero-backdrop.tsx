"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

import Aurora from "@/components/reactbits/Aurora";

/**
 * Animated field behind the hero.
 *
 * Aurora's stock palette is purple/green; these stops are the DS-01 ramp
 * (ember → orange → orange-light) so the motion stays recognisably PAC
 * rather than looking borrowed.
 *
 * Two things learned from actually looking at it in a browser:
 *
 *  - It must be rendered OUTSIDE the hero's `max-w-6xl` container. Inside
 *    it, `inset-x-0` resolves to the container's 1152px, and the wash ends
 *    in two hard vertical edges against the page — obvious in light mode.
 *    Its parent has to be full-bleed.
 *  - The mask is radial, not a bottom-only linear fade. A linear fade still
 *    leaves crisp left and right edges; this falls off in every direction
 *    from the top centre, so the field has no boundary anywhere.
 *
 * Opacity is deliberately low — on paper this reads as a muddy salmon slab
 * long before it reads as "too subtle", and the type has to stay the
 * loudest thing on the page.
 *
 * Skipped entirely under `prefers-reduced-motion`, and mounted only after
 * hydration so the WebGL context never blocks first paint.
 */
export function HeroBackdrop() {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || reduceMotion) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] opacity-25 [mask-image:radial-gradient(115%_85%_at_50%_0%,black_30%,transparent_78%)] dark:opacity-50"
    >
      <Aurora
        colorStops={["#A63A1C", "#E8532E", "#F4A98D"]}
        amplitude={0.8}
        blend={0.65}
        speed={0.4}
      />
    </div>
  );
}
