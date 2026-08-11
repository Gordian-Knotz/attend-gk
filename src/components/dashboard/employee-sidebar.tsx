"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
 * Real routes, not anchors: `/dashboard/shifts`, `/dashboard/attendance` and
 * `/dashboard/leave` each own their query and their own failure state — see
 * doc 11 on why a query failure must not render as an empty state. The
 * active row is read from the URL via `usePathname`, so there is no
 * scroll-spy and nothing to keep in sync with a scroll container.
 */
const SECTIONS = [
  { href: "/dashboard", label: "Clock in", icon: Fingerprint },
  { href: "/dashboard/shifts", label: "Shifts", icon: CalendarClock },
  { href: "/dashboard/attendance", label: "History", icon: History },
  { href: "/dashboard/leave", label: "Leave", icon: Palmtree },
] as const;

const ACTIVE_LAYOUT_ID = "employee-nav-active";

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  reduceMotion,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  reduceMotion: boolean | null;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
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
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  const active = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

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
              key={section.href}
              {...section}
              active={active(section.href)}
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
        {SECTIONS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors",
              active(href)
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
