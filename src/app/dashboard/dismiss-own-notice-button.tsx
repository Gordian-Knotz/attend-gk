"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";

import { dismissNoticeForSelf } from "@/app/admin/notifications-actions";
import { Button } from "@/components/ui/button";

/**
 * Hides a single notice for the person who clicks — nobody else. Unlike
 * `DeleteNoticeButton` (which removes a notice for the whole org and is
 * gated behind a confirm), this affects only the caller's own view, so
 * there is nothing to confirm.
 */
export function DismissOwnNoticeButton({ noticeId }: { noticeId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const result = await dismissNoticeForSelf(noticeId);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    } catch {
      window.alert("Couldn't dismiss the notice. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label="Dismiss this notice"
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
