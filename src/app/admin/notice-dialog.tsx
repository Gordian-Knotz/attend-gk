"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone } from "lucide-react";

import { postNotice } from "./notifications-actions";
import { describeAudience } from "@/lib/notice-audience";
import { useAdminIdentity } from "@/components/admin/identity-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

export function PostNoticeDialog({
  sites,
}: {
  sites: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { role, siteName } = useAdminIdentity();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [level, setLevel] = React.useState("info");
  const [siteId, setSiteId] = React.useState("all");
  const [targetRole, setTargetRole] = React.useState("all");

  const isManager = role === "manager";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const result = await postNotice({
      message: String(form.get("message") ?? ""),
      level,
      siteId: siteId === "all" ? null : siteId,
      targetRole: targetRole === "all" ? null : targetRole,
    });

    setLoading(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setLevel("info");
    setSiteId("all");
    setTargetRole("all");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Megaphone /> Post notice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post a notice</DialogTitle>
          <DialogDescription>
            {isManager
              ? "Staff see this on their dashboard. Narrow who with the role selector below — it always stays within your own site."
              : "Staff see this on their dashboard, admins on the admin overview. The selectors below set who — everyone in your organization by default."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              name="message"
              rows={3}
              maxLength={500}
              placeholder="Night shift starts an hour earlier from Monday."
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="level">Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger id="level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!isManager && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="site">Site</Label>
                <Select value={siteId} onValueChange={setSiteId}>
                  <SelectTrigger id="site">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sites</SelectItem>
                    {sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Managers may target any role — just not any site, which is
                pinned to their own above. */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="target-role">Role</Label>
              <Select value={targetRole} onValueChange={setTargetRole}>
                <SelectTrigger id="target-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="manager">Managers</SelectItem>
                  <SelectItem value="org_admin">Admins</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Goes to{" "}
            <span className="font-medium text-foreground">
              {describeAudience({
                // Managers never render the site Select, so siteId stays the
                // "all" placeholder for them — but postNotice() still pins
                // the notice to their own site (identity.siteId from
                // getEmployeeContext). Naming that site here, rather than
                // reading siteId as "no site filter", keeps this preview
                // from claiming an org-wide audience the notice won't reach.
                siteName: isManager
                  ? siteName
                  : siteId === "all"
                    ? null
                    : sites.find((s) => s.id === siteId)?.name ?? null,
                targetRole: targetRole === "all" ? null : targetRole,
              })}
            </span>
            .
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              Post notice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
