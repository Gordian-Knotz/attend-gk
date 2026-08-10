"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserMinus, Loader2 } from "lucide-react";

import { removeStaff } from "./actions";
import { Button } from "@/components/ui/button";

export function RemoveStaffButton({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    if (!window.confirm(`Remove ${employeeName} from this organization?`)) return;
    setLoading(true);
    try {
      const result = await removeStaff(employeeId);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    } catch {
      window.alert("Couldn't remove that person. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Remove ${employeeName}`}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? <Loader2 className="animate-spin" /> : <UserMinus />}
    </Button>
  );
}
