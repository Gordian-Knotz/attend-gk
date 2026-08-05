"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search, LogOut, UserCog, Building2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAdminIdentity } from "@/components/admin/identity-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MOBILE_NAV = [
  { label: "Overview", href: "/admin" },
  { label: "Sites", href: "/admin/sites" },
  { label: "Staff", href: "/admin/staff" },
  { label: "Schedule", href: "/admin/schedule" },
  { label: "Devices", href: "/admin/devices" },
  { label: "Reports", href: "/admin/reports" },
  { label: "Settings", href: "/admin/settings" },
] as const;

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AdminTopbar() {
  const identity = useAdminIdentity();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-16 items-center gap-3 border-b border-border px-4 md:px-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="md:hidden">
            <Menu />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {MOBILE_NAV.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>{item.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex items-center gap-2 rounded-sm border border-border px-3 py-1.5 text-sm">
        <Building2 className="size-3.5 text-muted-foreground" />
        {identity.orgName}
      </div>

      <div className="relative ml-2 hidden max-w-xs flex-1 sm:block">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search staff, sites…" className="pl-8" />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1">
              <Avatar>
                <AvatarFallback>{initials(identity.fullName)}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div>{identity.fullName}</div>
              <div className="font-normal text-muted-foreground">
                {identity.email}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin/settings">
                <UserCog /> Account settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
