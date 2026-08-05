"use client";

import * as React from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { timesheetToCsv, type TimesheetRow } from "@/lib/timesheet";

export function ExportButton({
  rows,
  periodLabel,
  fileName,
}: {
  rows: TimesheetRow[];
  periodLabel: string;
  fileName: string;
}) {
  const [done, setDone] = React.useState(false);

  function handleExport() {
    const csv = timesheetToCsv(rows, periodLabel);
    // ﻿ so Excel opens it as UTF-8 rather than mangling accented names.
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setDone(true);
    window.setTimeout(() => setDone(false), 2500);
  }

  return (
    <Button onClick={handleExport} disabled={rows.length === 0} size="sm">
      <Download />
      {done ? "Downloaded" : "Export CSV"}
    </Button>
  );
}
