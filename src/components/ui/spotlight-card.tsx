"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * DS-01 adaptation of React Bits' SpotlightCard.
 *
 * The vendored original hardcodes `rounded-3xl border-neutral-800
 * bg-neutral-900 p-8` and a white spotlight — a dark-only card with a
 * 24px radius, against a system whose radius is 0.2rem and which has to
 * work on paper as well as ink. This keeps the pointer-tracking behaviour
 * and rebuilds the surface on card tokens, with the spotlight in brand
 * orange at an opacity that reads in both themes.
 *
 * Pointer-only by nature, so it's pure decoration — the card's content and
 * focus behaviour are unaffected, and nothing here is announced.
 */
export function SpotlightCard({
  children,
  className,
  spotlightColor = "color-mix(in srgb, var(--primary) 22%, transparent)",
}: {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
}) {
  const divRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = React.useState(0);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = divRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={cn(
        // Mirrors ui/card.tsx's shell exactly, so CardHeader / CardContent
        // lay out identically inside either one.
        "bg-card text-card-foreground border border-border rounded-sm flex flex-col gap-4 py-5",
        "relative overflow-hidden transition-colors duration-300 hover:border-primary/40",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-in-out motion-reduce:hidden"
        style={{
          opacity,
          background: `radial-gradient(circle 22rem at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}
