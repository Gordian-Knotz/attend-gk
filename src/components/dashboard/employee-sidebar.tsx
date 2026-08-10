"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  Fingerprint,
  CalendarClock,
  History,
  Palmtree,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/wordmark";

/**
 * Staff-side navigation for `/dashboard`.
 *
 * Deliberately **anchors into one page, not routes.** Splitting this into
 * `/dashboard/shifts`, `/dashboard/attendance` and `/dashboard/leave` would
 * mean three more RLS-scoped queries and three more failure states to get
 * right — and doc 11 is explicit that a query failure must not render as an
 * empty state, which for a shift worker means "you are not rostered". One
 * page with four sections has one set of queries and one set of error paths.
 * Promote it to real routes when a section outgrows a card.
 *
 * The active row is tracked by IntersectionObserver against the viewport,
 * which is correct *because the dashboard scrolls the document*. If `<main>`
 * ever becomes its own `overflow-y-auto` container — as the admin one is —
 * this needs `root` set to that element, the same trap doc 07 hit with GSAP
 * ScrollTrigger.
 */
const SECTIONS = [
  { id: "clock-in", label: "Clock in", icon: Fingerprint },
  { id: "shifts", label: "Shifts", icon: CalendarClock },
  { id: "history", label: "History", icon: History },
  { id: "leave", label: "Leave", icon: Palmtree },
] as const;

const ACTIVE_LAYOUT_ID = "employee-nav-active";

function useActiveSection() {
  const [active, setActive] = React.useState<string>(SECTIONS[0].id);

  React.useEffect(() => {
    const elements = SECTIONS.map(({ id }) =>
      document.getElementById(id)
    ).filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry nearest the top of the viewport rather than the first
        // intersecting one: two sections are usually on screen at once, and
        // "first in DOM order" makes the highlight lag a section behind.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          );

        if (visible[0]) setActive(visible[0].target.id);
      },
      // Bias the band towards the upper half of the viewport so the row
      // highlights as a section arrives, not once it fills the screen.
      { rootMargin: "-10% 0px -55% 0px", threshold: 0 }
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return active;
}

function NavItem({
  id,
  label,
  icon: Icon,
  active,
  reduceMotion,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  reduceMotion: boolean | null;
}) {
  return (
    <Link
      href={`#${id}`}
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors",
        active
          ? "text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      {active &&
        (reduceMotion ? (
          <span className="absolute inset-0 rounded-sm bg-primary" />
        ) : (
          <motion.span
            layoutId={ACTIVE_LAYOUT_ID}
            className="absolute inset-0 rounded-sm bg-primary"
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          />
        ))}
      <span className="relative flex items-center gap-3">
        <Icon className="size-4 shrink-0" strokeWidth={1.75} />
        {label}
      </span>
    </Link>
  );
}

export function EmployeeSidebar({ siteName }: { siteName: string | null }) {
  const active = useActiveSection();
  const reduceMotion = useReducedMotion();

  return (
    <>
      {/* Desktop: the same 15rem rail the admin sidebar uses, so an employee
          who is later promoted to manager recognises the furniture. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center border-b border-border px-6">
          <Link href="/dashboard">
            <Wordmark size="lg" />
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {SECTIONS.map((section) => (
            <NavItem
              key={section.id}
              {...section}
              active={active === section.id}
              reduceMotion={reduceMotion}
            />
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <span className="font-label px-3 text-muted-foreground">
            {siteName ?? "No site assigned"}
          </span>
        </div>
      </aside>

      {/* Mobile: a horizontal rail under the header. A dropdown would hide the
          four destinations behind a tap, and there are only four. */}
      <nav className="sticky top-0 z-30 flex gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <Link
            key={id}
            href={`#${id}`}
            aria-current={active === id ? "true" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors",
              active === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
