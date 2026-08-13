import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Wordmark } from "@/components/brand/wordmark";

/**
 * Activ-HR's own operator console — the vendor's view of its tenants, not a
 * tenant's view of itself.
 *
 * Deliberately outside `/admin`. Everything under `/admin` is written on the
 * assumption that it is scoped to one organization; mixing a cross-org
 * surface into that layout is how a page ends up quietly showing another
 * tenant's numbers. A separate route segment makes the boundary structural.
 *
 * Gated three times, on purpose: here, on the page, and by RLS underneath.
 * The UI gates fail closed and give an honest 'not for you' redirect; RLS
 * is the one that actually holds.
 */
export default async function SuperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await getEmployeeContext();

  if (!identity) redirect("/login?next=/super");
  if (identity.role !== "super_admin") redirect("/admin");

  return (
    <div className="min-h-screen bg-secondary/20">
      <header className="border-b-2 border-foreground bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-4">
          <div className="flex items-baseline gap-1.5">
            <Wordmark size="xl" />
          </div>

          <Badge variant="attention" className="gap-1.5">
            <ShieldCheck className="size-3" />
            Platform
          </Badge>

          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/super/billing"
              className="font-label inline-flex items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              Billing
            </Link>
            <Link
              href="/admin"
              className="font-label inline-flex items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-3.5" />
              Your organization
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
