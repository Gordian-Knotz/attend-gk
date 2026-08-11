"use client";

import * as React from "react";

export type AdminIdentity = {
  fullName: string;
  email: string;
  role: "staff" | "manager" | "org_admin" | "super_admin";
  orgId: string;
  orgName: string;
  siteId: string | null;
  siteName: string | null;
};

const AdminIdentityContext = React.createContext<AdminIdentity | null>(null);

export function AdminIdentityProvider({
  value,
  children,
}: {
  value: AdminIdentity;
  children: React.ReactNode;
}) {
  return (
    <AdminIdentityContext.Provider value={value}>
      {children}
    </AdminIdentityContext.Provider>
  );
}

export function useAdminIdentity() {
  const ctx = React.useContext(AdminIdentityContext);
  if (!ctx) {
    throw new Error("useAdminIdentity must be used within AdminIdentityProvider");
  }
  return ctx;
}
