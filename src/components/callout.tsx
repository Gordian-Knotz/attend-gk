import * as React from "react";

import { cn } from "@/lib/utils";

type CalloutProps = {
  variant: "note" | "status" | "critical";
  label: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * DS-01 §04 — three escalating callout treatments:
 *  - "note":     rule and chip. Quiet. Dependencies, footnotes.
 *  - "status":   label bar on tint. Status states (ready, proposed...).
 *  - "critical": ink panel. Reserved for anything a person must act on.
 */
export function Callout({ variant, label, meta, children, className }: CalloutProps) {
  if (variant === "critical") {
    return (
      <div className={cn("rounded-sm bg-pac-ink px-5 py-4 text-pac-paper", className)}>
        <div className="flex items-center justify-between">
          <span className="font-label text-primary">{label}</span>
          {meta && (
            <span className="font-mono text-xs text-pac-paper/60">{meta}</span>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed">{children}</p>
      </div>
    );
  }

  if (variant === "status") {
    return (
      <div className={cn("overflow-hidden rounded-sm", className)}>
        <div className="flex items-center justify-between bg-primary px-3 py-1.5 text-primary-foreground">
          <span className="font-label">{label}</span>
          {meta && <span className="font-mono text-xs">{meta}</span>}
        </div>
        <div className="bg-accent/40 px-4 py-3 text-sm">{children}</div>
      </div>
    );
  }

  return (
    <div className={cn("border-l-2 border-primary pl-4", className)}>
      <span className="font-label text-primary">{label}</span>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
