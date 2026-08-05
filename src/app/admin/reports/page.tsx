import { PageHeader } from "@/components/admin/page-header";
import { StubPage } from "@/components/admin/stub-page";

export default function ReportsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Reports"
        description="Timesheets, CSV/Excel export, payroll integration hooks."
      />
      <StubPage what="Reporting & payroll export" />
    </div>
  );
}
