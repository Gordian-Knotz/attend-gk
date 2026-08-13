"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Fingerprint,
  FileBarChart,
  Settings,
  Globe,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAdminIdentity } from "@/components/admin/identity-context";
import { Wordmark } from "@/components/brand/wordmark";

const NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Sites", href: "/admin/sites", icon: Building2 },
  { label: "Staff", href: "/admin/staff", icon: Users },
  { label: "Attendance", href: "/admin/attendance", icon: CalendarDays },
  { label: "Schedule", href: "/admin/schedule", icon: CalendarClock },
  { label: "Leave", href: "/admin/leave", icon: CalendarCheck },
  { label: "Devices", href: "/admin/devices", icon: Fingerprint },
  { label: "Reports", href: "/admin/reports", icon: FileBarChart },
  { label: "Billing", href: "/admin/billing", icon: CreditCard },
  { label: "Settings", href: "/admin/settings", icon: Settings },
] as const;

// Points out of /admin on purpose. Everything else in this sidebar is
// scoped to one organization; the platform console is not, and it has its
// own layout so the two can't be confused. See src/app/super/layout.tsx.
const PLATFORM_NAV = [
  { label: "All organizations", href: "/super", icon: Globe },
] as const;

/**
 * The active highlight is a single shared element (`layoutId`), so moving
 * between sections slides it rather than blinking it from one row to the
 * next — including across the Platform group divider.
 */
const ACTIVE_LAYOUT_ID = "admin-nav-active";

function NavItem({
  label,
  href,
  icon: Icon,
  active,
  reduceMotion,
}: {
  label: string;
  href: string;
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

export function AdminSidebar() {
  const pathname = usePathname();
  const { role } = useAdminIdentity();
  const reduceMotion = useReducedMotion();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-16 items-center border-b border-border px-6">
        <Link href="/admin" className="flex items-baseline gap-1.5">
          <Wordmark size="lg" />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href)
            }
            reduceMotion={reduceMotion}
          />
        ))}

        {role === "super_admin" && (
          <>
            <span className="font-label mt-4 px-3 py-2 text-muted-foreground">
              Platform
            </span>
            {PLATFORM_NAV.map((item) => (
              <NavItem
                key={item.href}
                {...item}
                active={pathname.startsWith(item.href)}
                reduceMotion={reduceMotion}
              />
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-border p-3">
        <span className="font-label text-muted-foreground px-3">
          Activ-HR · Demo data
        </span>
      </div>
    </aside>
  );
}
