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
    const result = await deleteShift(shiftId);
    setLoading(false);
    if (result?.error) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="animate-spin" /> : <X />}
    </Button>
  );
}
