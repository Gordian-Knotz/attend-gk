"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

import { deleteSite } from "./actions";
import { Button } from "@/components/ui/button";

export function DeleteSiteButton({
  siteId,
  siteName,
}: {
  siteId: string;
  siteName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    if (!window.confirm(`Remove ${siteName}? Staff assigned here will become unassigned.`)) {
      return;
    }
    setLoading(true);
    try {
      const result = await deleteSite(siteId);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    } catch {
      window.alert("Couldn't remove the site. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Remove ${siteName}`}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
