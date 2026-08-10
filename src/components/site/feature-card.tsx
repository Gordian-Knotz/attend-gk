"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

import GlareHover from "@/components/reactbits/GlareHover";
import { cn } from "@/lib/utils";

/**
 * Card surface for the feature clusters — a light sweep passes across the
 * card on hover, which suits a brand built on paper and print.
 *
 * Wraps React Bits' GlareHover and neutralises three of its defaults that
 * don't fit a content card: a fixed 500px box, `grid place-items-center`,
 * and `cursor-pointer` on something that isn't clickable. Cursor is set
 * inline because GlareHover merges `style` last, which is the only override
 * that reliably beats its own class list.
 *
 * `glareColor` has to be a hex string — GlareHover parses it into rgba
 * channels, so a CSS custom property won't work here. Background and border
 * do take vars, so the card still follows the light/dark tokens.
 */
export function FeatureCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const surface = cn(
    "rounded-sm border border-border bg-card transition-colors duration-300 hover:border-primary/40",
    className
  );

  // Mount-gated — see doc 13. The GlareHover branch and this plain div do not
  // emit the same markup, so branching during render is a hydration mismatch
  // under `prefers-reduced-motion`.
  if (mounted && reduceMotion) {
    return <div className={cn(surface, "p-7")}>{children}</div>;
  }

  return (
    <GlareHover
      width="100%"
      height="100%"
      background="var(--card)"
      borderColor="var(--border)"
      borderRadius="0.2rem"
      glareColor="#E8532E"
      // Slow and wide. At 750ms the sweep read as a flicker — it crossed
      // the card before the eye caught it, which made the card feel
      // twitchy rather than lit. A long, low-opacity pass reads as light
      // moving across paper, which is the point.
      glareOpacity={0.14}
      glareAngle={-30}
      glareSize={340}
      transitionDuration={1600}
      className={cn(
        "!place-items-stretch transition-colors duration-300 hover:border-primary/40",
        className
      )}
      style={{ cursor: "default" }}
    >
      <div className="w-full p-7">{children}</div>
    </GlareHover>
  );
}
