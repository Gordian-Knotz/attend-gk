"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import { createShift } from "./actions";
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

type Employee = { id: string; full_name: string; site_id: string | null };
type Site = { id: string; name: string };

/** `toISOString()` is UTC, so before 03:00 in Nairobi this defaulted the
 *  date picker to yesterday. */
function todayStr() {
  return localDateKey(new Date());
}

export function AddShiftDialog({
  employees,
  sites,
}: {
  employees: Employee[];
  sites: Site[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [employeeId, setEmployeeId] = React.useState(employees[0]?.id ?? "");
  const [siteId, setSiteId] = React.useState(
    employees[0]?.site_id ?? sites[0]?.id ?? ""
  );

  function handleEmployeeChange(id: string) {
    setEmployeeId(id);
    const emp = employees.find((e) => e.id === id);
    if (emp?.site_id) setSiteId(emp.site_id);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const result = await createShift({
      employeeId,
      siteId,
      date: String(form.get("date")),
      startTime: String(form.get("startTime")),
      endTime: String(form.get("endTime")),
    });

    setLoading(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> Add shift
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a shift</DialogTitle>
          <DialogDescription>Assign one employee to one site for a time window.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="employee">Employee</Label>
            <Select value={employeeId} onValueChange={handleEmployeeChange}>
              <SelectTrigger id="employee">
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="site">Site</Label>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger id="site">
                <SelectValue placeholder="Select site" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" name="date" type="date" defaultValue={todayStr()} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startTime">Start</Label>
              <Input id="startTime" name="startTime" type="time" defaultValue="07:00" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endTime">End</Label>
              <Input id="endTime" name="endTime" type="time" defaultValue="17:00" required />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading || !employeeId || !siteId}>
              {loading && <Loader2 className="animate-spin" />}
              Add shift
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
