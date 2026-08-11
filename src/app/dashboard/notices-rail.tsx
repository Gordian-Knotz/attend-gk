import { Megaphone } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { formatDate } from "@/lib/timezone";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DismissOwnNoticeButton } from "./dismiss-own-notice-button";

/** Left border per level, so severity is legible without reading the words. */
const LEVEL_BORDER: Record<string, string> = {
  critical: "border-l-2 border-l-destructive",
  warning: "border-l-2 border-l-primary",
  info: "border-l-2 border-l-border",
};

/**
 * Notices addressed to the signed-in employee.
 *
 * The audience rule — same org, site unset or matching, role unset or matching —
 * is enforced by RLS in migration 0013 and is deliberately NOT reimplemented
 * here. Two versions of one rule drift, and the version in the database is the
 * one that actually protects anything.
 */
export async function NoticesRail() {
  const employee = await getEmployeeContext();
  if (!employee) return null;

  const supabase = await createClient();

  const [noticesRes, dismissedRes] = await Promise.all([
    supabase
      .from("notifications")
      // target_role is selected as a schema guard, not for use here: against
      // a database that hasn't run migration 0013, target_role doesn't
      // exist, so this select 400s, noticesFailed becomes true, and the rail
      // fails closed into "Couldn't load notices" below. Without it, this
      // query only names pre-0013 columns and succeeds against 0006's wider
      // read policy (same org, no site/role narrowing) — silently showing
      // every notice in the org, including ones pinned to other sites.
      // Removing this column reintroduces that cross-site disclosure.
      .select("id, message, level, created_at, target_role")
      .eq("org_id", employee.orgId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("notification_dismissals")
      .select("notification_id")
      .eq("employee_id", employee.id),
  ]);

  // These two failures mean different things and are shown differently below:
  // if the notices read itself failed, nothing can be said about notices at
  // all. If only the dismissals read failed, the notices are known but which
  // of them were dismissed is not — showing them unfiltered is defensible,
  // silently treating "unknown" as "none dismissed" is not.
  const noticesFailed = Boolean(noticesRes.error);
  const dismissalsFailed = Boolean(dismissedRes.error);

  const dismissed = new Set(
    (dismissedRes.data ?? []).map((d) => d.notification_id)
  );
  const notices = noticesFailed
    ? []
    : dismissalsFailed
      ? (noticesRes.data ?? [])
      : (noticesRes.data ?? []).filter((n) => !dismissed.has(n.id));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Notices</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Three distinct states, three distinct claims. Never let the "don't
            assume there are none" copy sit above a rendered list — when
            noticesFailed is true, `notices` is always empty, so the list
            below is a no-op in that branch. */}
        {noticesFailed && (
          <p className="text-sm text-destructive">
            Couldn&apos;t load notices. Reload — don&apos;t assume there are none.
          </p>
        )}

        {!noticesFailed && dismissalsFailed && notices.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Showing all notices; couldn&apos;t check which you&apos;ve dismissed.
          </p>
        )}

        {!noticesFailed && notices.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            Nothing from your manager right now.
          </p>
        )}

        {notices.map((notice) => (
          <div
            key={notice.id}
            className={`flex flex-col gap-2 rounded-sm bg-secondary/40 p-3 ${
              LEVEL_BORDER[notice.level] ?? LEVEL_BORDER.info
            }`}
          >
            <p className="text-sm">{notice.message}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="font-label text-muted-foreground">
                {formatDate(new Date(notice.created_at))}
              </span>
              <DismissOwnNoticeButton noticeId={notice.id} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
