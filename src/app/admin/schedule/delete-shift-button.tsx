"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";

import { deleteShift } from "./actions";
import { Button } from "@/components/ui/button";

export function DeleteShiftButton({ shiftId }: { shiftId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const result = await deleteShift(shiftId);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    } catch {
      window.alert("Couldn't delete the shift. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Delete shift"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? <Loader2 className="animate-spin" /> : <X />}
    </Button>
  );
}
