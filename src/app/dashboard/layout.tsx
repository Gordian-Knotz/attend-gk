import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { DISPLAY_LOCALE, ORG_TIME_ZONE } from "@/lib/timezone";
import { OrgSuspended } from "@/components/org-suspended";
import { EmployeeSidebar } from "@/components/dashboard/employee-sidebar";
import { HelpChatWidget } from "@/components/help/help-chat-widget";
import { SignOutButton } from "./sign-out-button";
import { NoticesRail } from "./notices-rail";

/**
 * Shared chrome for every staff route.
 *
 * The guards live here rather than in each page: signed-out, no employee row,
 * and suspended organization are properties of the person, not of the page they
 * asked for. `getEmployeeContext` is wrapped in `perRequest`, so the layout and
 * the page calling it cost one round trip per navigation, not two.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">
          You need to be signed in to view your dashboard.
        </p>
        <Link href="/login" className="text-primary underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  const employee = await getEmployeeContext();

  if (!employee) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">
          Your account (<span className="font-mono">{user.email}</span>) isn&apos;t
          linked to an organization yet.
        </p>
        <p className="text-sm text-muted-foreground">
          Ask your admin to add you as an employee, or{" "}
          <Link href="/onboarding" className="text-primary underline">
            set up your own organization
          </Link>
          .
        </p>
        <SignOutButton />
      </div>
    );
  }

  if (employee.orgSuspendedAt) {
    return (
      <OrgSuspended
        orgName={employee.orgName}
        reason={employee.orgSuspendedReason}
      />
    );
  }

  const firstName = employee.fullName.split(" ")[0];
  const today = new Date().toLocaleDateString(DISPLAY_LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: ORG_TIME_ZONE,
  });

  return (
    // A row only from md up. Unconditional `flex` makes the mobile rail a flex
    // ITEM of the row, so it sits beside the content instead of above it — see
    // doc 14. Do not change this to `flex`.
    <div className="min-h-screen bg-secondary/20 md:flex">
      <EmployeeSidebar siteName={employee.siteName} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
            <div>
              <div className="font-display text-xl">Hi, {firstName}</div>
              <div className="text-sm text-muted-foreground">{today}</div>
            </div>
            <SignOutButton />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-6 py-8">
          {/* Rail beside the content at lg, BELOW it under lg — not hidden. A
              notice nobody sees on a phone is the bug this feature exists to
              fix. */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">{children}</div>
            <aside
              aria-label="Notices"
              className="w-full shrink-0 lg:sticky lg:top-6 lg:w-72"
            >
              <NoticesRail />
            </aside>
          </div>
        </main>
      </div>

      <HelpChatWidget role={employee.role} />
    </div>
  );
}
