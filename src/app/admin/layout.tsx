import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopbar } from "@/components/admin/topbar";
import { AdminIdentityProvider } from "@/components/admin/identity-context";
import { OrgSuspended } from "@/components/org-suspended";
import { HelpChatWidget } from "@/components/help/help-chat-widget";

export const metadata: Metadata = {
  title: "Activ-HR — Admin",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const employee = await getEmployeeContext();

  if (!employee) {
    redirect("/onboarding");
  }

  // Section 06: staff can't access the admin dashboard.
  if (employee.role === "staff") {
    redirect("/dashboard");
  }

  // A suspended tenant sees an explanation instead of the product. Checked
  // after the role redirect so a suspended org's staff land on /dashboard
  // and get the same notice there, rather than two different messages.
  // super_admin is exempt — that's us, and locking ourselves out of the
  // console that lifts suspensions would be an unfortunate way to find out.
  if (employee.orgSuspendedAt && employee.role !== "super_admin") {
    return (
      <OrgSuspended
        orgName={employee.orgName}
        reason={employee.orgSuspendedReason}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AdminIdentityProvider
      value={{
        fullName: employee.fullName,
        email: user?.email ?? "",
        role: employee.role,
        orgId: employee.orgId,
        orgName: employee.orgName,
        siteId: employee.siteId,
        siteName: employee.siteName,
      }}
    >
      <div className="flex h-screen overflow-hidden">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar />
          {/* Entry animation lives in template.tsx, not here — a layout
              persists across sibling-route navigation, so it would only
              ever run on first load. Also avoids ScrollTrigger inside this
              scroll container, which measures against the window and can
              strand a below-the-fold card at opacity:0. */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>

      <HelpChatWidget role={employee.role} />
    </AdminIdentityProvider>
  );
}
