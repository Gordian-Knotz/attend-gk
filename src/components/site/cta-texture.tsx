"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

import ShapeGrid from "@/components/reactbits/ShapeGrid";

/**
 * Drifting grid behind the CTA band, with cells lighting up under the
 * pointer.
 *
 * One palette covers both themes: the band is a dark field either way —
 * ink against paper in light mode, graphite against ink in dark — so
 * light-on-dark strokes are always correct.
 *
 * Kept near-invisible at rest (8% paper). The band's job is to carry a
 * headline and two buttons; this is texture underneath it, and anything
 * more legible starts competing with the type. Masked at the edges so the
 * grid has no visible boundary, and skipped entirely under reduced motion.
 */
export function CtaTexture() {
  const reduceMotion = useReducedMotion();

  // Mount-gated, not decided during render: returning null on a reduced-motion
  // client while the server emitted the grid is a hydration mismatch. Same
  // shape as `hero-threads.tsx`, which already does this. See doc 13.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (mounted && reduceMotion) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-auto absolute inset-0 [mask-image:radial-gradient(80%_100%_at_30%_50%,black_10%,transparent_85%)]"
    >
      <ShapeGrid
        shape="hexagon"
        direction="right"
        speed={0.25}
        squareSize={44}
        borderColor="rgba(247, 243, 236, 0.08)"
        hoverFillColor="rgba(232, 83, 46, 0.22)"
        hoverTrailAmount={3}
      />
    </div>
  );
}
