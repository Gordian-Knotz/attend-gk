import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopbar } from "@/components/admin/topbar";
import { AdminIdentityProvider } from "@/components/admin/identity-context";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "AttendPAC — Admin",
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
      }}
    >
      <div className="flex h-screen overflow-hidden">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar />
          {/* One reveal around the whole page rather than per-card: this
              <main> is its own scroll container, and ScrollTrigger instances
              inside it would measure against the window instead. Wrapping
              here keeps admin pages animating on navigation without any
              below-the-fold card risking a stuck opacity:0. */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <Reveal distance={16} duration={0.45}>
              {children}
            </Reveal>
          </main>
        </div>
      </div>
    </AdminIdentityProvider>
  );
}
