"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";

import { deleteNotice } from "./notifications-actions";
import { Button } from "@/components/ui/button";

export function DeleteNoticeButton({ noticeId }: { noticeId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    // This removes the notice for the whole organization, not just this
    // screen — worth a confirm now that "dismiss" (hide for me) is a
    // separate, unconfirmed action elsewhere.
    if (!window.confirm("Delete this notice for everyone? This can't be undone.")) {
      return;
    }

    setLoading(true);
    try {
      const result = await deleteNotice(noticeId);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    } catch {
      window.alert("Couldn't delete the notice. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label="Delete notice"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <X className="size-3.5" />
      )}
    </Button>
  );
}
