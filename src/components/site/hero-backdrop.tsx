"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

import Aurora from "@/components/reactbits/Aurora";

/**
 * Animated field behind the hero.
 *
 * Aurora's stock palette is purple/green; these stops are the DS-01 ramp
 * (ember → orange → orange-light) so the motion stays recognisably PAC
 * rather than looking borrowed. Kept low-amplitude and masked to a fade at
 * the bottom edge so the hero copy still sits on a flat field — the type
 * has to stay the loudest thing on the page.
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
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] opacity-45 [mask-image:linear-gradient(to_bottom,black_10%,transparent_92%)] dark:opacity-60"
    >
      <Aurora
        colorStops={["#A63A1C", "#E8532E", "#F4A98D"]}
        amplitude={0.85}
        blend={0.6}
        speed={0.5}
      />
    </div>
  );
}
