"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";

import { updateSite } from "../sites/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/**
 * Follows `sites/site-dialog.tsx` deliberately — same shape, same field order,
 * same validation messages surfaced from the same server action. The only
 * differences are the defaults and that this one carries a `siteId`.
 */
export function EditSiteDialog({
  site,
}: {
  site: {
    id: string;
    name: string;
    geofence_lat: number;
    geofence_lng: number;
    geofence_radius_m: number;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Clear a stale error when the dialog is reopened, rather than showing the
  // last failure above a fresh form.
  React.useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    try {
      const result = await updateSite({
        siteId: site.id,
        name: String(form.get("name")),
        lat: Number(form.get("lat")),
        lng: Number(form.get("lng")),
        radiusM: Number(form.get("radiusM")),
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't save just now. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`Edit ${site.name}`}>
          <Pencil /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {site.name}</DialogTitle>
          <DialogDescription>
            Moving the centre or changing the radius takes effect on the next
            check-in. Staff already clocked in are not affected.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`name-${site.id}`}>Site name</Label>
            <Input
              id={`name-${site.id}`}
              name="name"
              defaultValue={site.name}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`lat-${site.id}`}>Latitude</Label>
              <Input
                id={`lat-${site.id}`}
                name="lat"
                type="number"
                step="any"
                defaultValue={site.geofence_lat}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`lng-${site.id}`}>Longitude</Label>
              <Input
                id={`lng-${site.id}`}
                name="lng"
                type="number"
                step="any"
                defaultValue={site.geofence_lng}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`radius-${site.id}`}>
              Geofence radius (metres)
            </Label>
            <Input
              id={`radius-${site.id}`}
              name="radiusM"
              type="number"
              defaultValue={site.geofence_radius_m}
              min={10}
              max={20000}
              required
            />
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
              Save site
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
