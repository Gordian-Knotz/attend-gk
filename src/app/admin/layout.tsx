import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopbar } from "@/components/admin/topbar";
import { AdminIdentityProvider } from "@/components/admin/identity-context";

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
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </AdminIdentityProvider>
  );
}
