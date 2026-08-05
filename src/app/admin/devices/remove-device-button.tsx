"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

import { removeDevice } from "./actions";
import { Button } from "@/components/ui/button";

export function RemoveDeviceButton({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    if (!window.confirm("Remove this device? It will stop being able to push punches.")) return;
    setLoading(true);
    const result = await removeDevice(deviceId);
    setLoading(false);
    if (result?.error) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
