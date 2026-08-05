"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";

const LEVELS = ["info", "warning", "critical"] as const;
export type NoticeLevel = (typeof LEVELS)[number];

export async function postNotice(input: {
  message: string;
  level: string;
  siteId: string | null;
}) {
  const employee = await getEmployeeContext();
  if (!employee || employee.role === "staff") {
    return { error: "Only managers and admins can post notices." };
  }

  const message = input.message.trim();
  if (!message) return { error: "Write a message first." };
  if (message.length > 500) {
    return { error: "Keep notices under 500 characters." };
  }

  const level = (LEVELS as readonly string[]).includes(input.level)
    ? (input.level as NoticeLevel)
    : "info";

  // Managers can only post to their own site — RLS enforces this too, but
  // pinning it here gives a clear error instead of an opaque policy failure.
  const siteId =
    employee.role === "manager" ? employee.siteId : (input.siteId ?? null);

  if (employee.role === "manager" && !siteId) {
    return { error: "You aren't assigned to a site yet." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("notifications").insert({
    org_id: employee.orgId,
    site_id: siteId,
    message,
    level,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true as const };
}

export async function dismissNotice(noticeId: string) {
  const employee = await getEmployeeContext();
  if (!employee || employee.role === "staff") {
    return { error: "Only managers and admins can dismiss notices." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("notifications").delete().eq("id", noticeId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true as const };
}
