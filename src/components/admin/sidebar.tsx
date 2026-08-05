"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarClock,
  Fingerprint,
  FileBarChart,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Sites", href: "/admin/sites", icon: Building2 },
  { label: "Staff", href: "/admin/staff", icon: Users },
  { label: "Schedule", href: "/admin/schedule", icon: CalendarClock },
  { label: "Devices", href: "/admin/devices", icon: Fingerprint },
  { label: "Reports", href: "/admin/reports", icon: FileBarChart },
  { label: "Settings", href: "/admin/settings", icon: Settings },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-16 items-center border-b border-border px-6">
        <Link href="/admin" className="flex items-baseline gap-1.5">
          <span className="font-serif text-lg">Attend</span>
          <span className="font-serif text-lg italic text-primary">Pac</span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <span className="font-label text-muted-foreground px-3">
          PAC Africa · Demo data
        </span>
      </div>
    </aside>
  );
}
