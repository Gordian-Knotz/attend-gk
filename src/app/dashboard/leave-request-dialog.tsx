"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, CalendarPlus } from "lucide-react";

import { requestLeave } from "./actions";
import { localDateKey } from "@/lib/attendance-series";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

const LEAVE_TYPES = ["annual", "sick", "compassionate", "unpaid"] as const;

/** `toISOString()` is UTC, so before 03:00 in Nairobi the date input
 *  defaulted to yesterday. Shared helper keeps it on the org calendar. */
function todayStr() {
  return localDateKey(new Date());
}

export function LeaveRequestDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [leaveType, setLeaveType] = React.useState<string>("annual");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Otherwise last attempt's error is still on screen when the dialog is
    // reopened, attached to fields the user hasn't filled in yet.
    if (!next) setError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const form = new FormData(e.currentTarget);
      const startDate = String(form.get("startDate"));
      const endDate = String(form.get("endDate"));

      // Checked here as well as server-side, so the user finds out before
      // a round trip rather than after.
      if (endDate < startDate) {
        setError("End date can't be before the start date.");
        return;
      }

      const result = await requestLeave({ leaveType, startDate, endDate });

      if (result?.error) {
        setError(result.error);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't submit that request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarPlus /> Request leave
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request leave</DialogTitle>
          <DialogDescription>
            Goes to your manager for approval — you&apos;ll see the status here once it&apos;s reviewed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="leaveType">Type</Label>
            <Select value={leaveType} onValueChange={setLeaveType}>
              <SelectTrigger id="leaveType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" name="startDate" type="date" defaultValue={todayStr()} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" name="endDate" type="date" defaultValue={todayStr()} required />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              Submit request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
